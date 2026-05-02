#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    collections::HashMap,
    ffi::c_void,
    fs,
    io::Write,
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    ptr,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use url::Url;
use windows_sys::Win32::{
    Foundation::{GetLastError, ERROR_NOT_FOUND, HWND},
    Security::Credentials::{
        CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
        CRED_TYPE_GENERIC,
    },
    UI::{
        Input::KeyboardAndMouse::{RegisterHotKey, MOD_CONTROL, MOD_NOREPEAT, MOD_SHIFT, VK_H},
        WindowsAndMessaging::{GetMessageW, MSG, WM_HOTKEY},
    },
};

const CAPTURE_EVENT: &str = "desktop://capture-screen-requested";
const CAPTURE_HOTKEY_ID: i32 = 0x4845;
static GLOBAL_CAPTURE_SHORTCUT_REGISTERED: AtomicBool = AtomicBool::new(false);

#[derive(serde::Serialize)]
struct DesktopNativeCapabilities {
    screen_capture: bool,
    clipboard_image: bool,
    global_shortcut: bool,
    tray: bool,
    keychain: bool,
    local_ollama_detection: bool,
    sandboxed_code_execution: bool,
    provider_fetch_proxy: bool,
}

#[derive(serde::Serialize)]
struct LocalEndpointStatus {
    url: String,
    reachable: bool,
    message: String,
}

#[derive(serde::Serialize)]
struct DesktopProviderSecretStatus {
    ok: bool,
}

#[derive(serde::Serialize)]
struct DesktopProviderSecretReadResult {
    found: bool,
    value: Option<String>,
}

#[derive(serde::Serialize, Clone)]
struct DesktopCaptureRequest {
    source: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopProviderFetchRequest {
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    timeout_ms: Option<u64>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopProviderFetchResponse {
    status: u16,
    status_text: String,
    headers: HashMap<String, String>,
    body: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum SandboxLanguage {
    Javascript,
    Python,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SandboxCodeRequest {
    language: SandboxLanguage,
    code: String,
    timeout_ms: Option<u64>,
    stdin: Option<String>,
    env_refs: Option<Vec<String>>,
}

#[derive(serde::Deserialize)]
struct SandboxConfirmation {
    accepted: bool,
    reason: String,
    confirmed_at: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SandboxExecutionResult {
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    duration_ms: u128,
    timed_out: bool,
}

#[tauri::command]
fn desktop_native_capabilities() -> DesktopNativeCapabilities {
    DesktopNativeCapabilities {
        screen_capture: true,
        clipboard_image: true,
        global_shortcut: GLOBAL_CAPTURE_SHORTCUT_REGISTERED.load(Ordering::Relaxed),
        tray: true,
        keychain: true,
        local_ollama_detection: true,
        sandboxed_code_execution: true,
        provider_fetch_proxy: true,
    }
}

#[tauri::command]
fn detect_local_ollama() -> LocalEndpointStatus {
    let url = "http://127.0.0.1:11434".to_string();
    let address = SocketAddr::from(([127, 0, 0, 1], 11434));
    match TcpStream::connect_timeout(&address, Duration::from_millis(300)) {
        Ok(_) => LocalEndpointStatus {
            url,
            reachable: true,
            message: "Local Ollama port is reachable.".to_string(),
        },
        Err(error) => LocalEndpointStatus {
            url,
            reachable: false,
            message: format!("Local Ollama port is not reachable: {error}"),
        },
    }
}

#[tauri::command]
fn save_desktop_provider_secret(
    provider_id: String,
    secret: String,
) -> Result<DesktopProviderSecretStatus, String> {
    validate_provider_id(&provider_id)?;
    if secret.is_empty() {
        return Err("Provider secret cannot be empty.".to_string());
    }
    write_provider_secret(&provider_id, &secret)?;
    Ok(DesktopProviderSecretStatus { ok: true })
}

#[tauri::command]
fn read_desktop_provider_secret(
    provider_id: String,
) -> Result<DesktopProviderSecretReadResult, String> {
    validate_provider_id(&provider_id)?;
    read_provider_secret(&provider_id)
}

#[tauri::command]
fn delete_desktop_provider_secret(
    provider_id: String,
) -> Result<DesktopProviderSecretStatus, String> {
    validate_provider_id(&provider_id)?;
    delete_provider_secret(&provider_id)?;
    Ok(DesktopProviderSecretStatus { ok: true })
}

#[tauri::command]
fn run_sandboxed_code(
    request: SandboxCodeRequest,
    confirmation: SandboxConfirmation,
) -> Result<SandboxExecutionResult, String> {
    validate_sandbox_confirmation(&confirmation)?;
    validate_sandbox_request(&request)?;
    let started = Instant::now();
    let work_dir = create_sandbox_work_dir()?;
    let result = run_sandboxed_code_in_dir(&request, &work_dir, started);
    let _ = fs::remove_dir_all(&work_dir);
    result
}

#[tauri::command]
async fn desktop_provider_fetch(
    request: DesktopProviderFetchRequest,
) -> Result<DesktopProviderFetchResponse, String> {
    validate_provider_fetch_request(&request)?;
    let timeout = Duration::from_millis(request.timeout_ms.unwrap_or(30_000).clamp(1_000, 60_000));
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| format!("Could not create desktop provider client: {error}"))?;

    let method = if request.method.eq_ignore_ascii_case("POST") {
        reqwest::Method::POST
    } else {
        reqwest::Method::GET
    };
    let mut builder = client
        .request(method, request.url)
        .headers(provider_fetch_headers(&request.headers)?);
    if let Some(body) = request.body {
        builder = builder.body(body);
    }

    let response = builder
        .send()
        .await
        .map_err(|error| format!("Desktop provider request failed: {error}"))?;
    let status = response.status();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|text| (name.as_str().to_string(), text.to_string()))
        })
        .collect();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Could not read desktop provider response: {error}"))?;
    if body.len() > 2_000_000 {
        return Err("Desktop provider response exceeded the 2 MB limit.".to_string());
    }

    Ok(DesktopProviderFetchResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        headers,
        body,
    })
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            setup_desktop_tray(app.handle())?;
            setup_global_capture_shortcut(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_native_capabilities,
            detect_local_ollama,
            save_desktop_provider_secret,
            read_desktop_provider_secret,
            delete_desktop_provider_secret,
            run_sandboxed_code,
            desktop_provider_fetch
        ])
        .run(tauri::generate_context!())
        .expect("error while running hello-world desktop shell");
}

fn validate_sandbox_confirmation(confirmation: &SandboxConfirmation) -> Result<(), String> {
    if confirmation.accepted
        && !confirmation.reason.trim().is_empty()
        && !confirmation.confirmed_at.trim().is_empty()
    {
        Ok(())
    } else {
        Err("Explicit confirmation is required before code execution.".to_string())
    }
}

fn validate_sandbox_request(request: &SandboxCodeRequest) -> Result<(), String> {
    if request.code.trim().is_empty() {
        return Err("Code cannot be empty.".to_string());
    }
    if request.code.len() > 20_000 {
        return Err("Code is too large for the sandbox runner.".to_string());
    }
    if request.stdin.as_ref().map_or(0, |value| value.len()) > 8_000 {
        return Err("stdin is too large for the sandbox runner.".to_string());
    }
    if request.timeout_ms.unwrap_or(5000) > 10_000 {
        return Err("Timeout exceeds sandbox limit.".to_string());
    }
    if request
        .env_refs
        .as_ref()
        .is_some_and(|items| items.iter().any(|item| !is_safe_env_ref(item)))
    {
        return Err("Environment references must be safe variable names.".to_string());
    }
    Ok(())
}

fn validate_provider_fetch_request(request: &DesktopProviderFetchRequest) -> Result<(), String> {
    let url = Url::parse(&request.url).map_err(|_| "Provider URL is not valid.".to_string())?;
    let scheme = url.scheme();
    let host = url
        .host_str()
        .ok_or_else(|| "Provider URL must include a host.".to_string())?;
    if !matches!(request.method.to_uppercase().as_str(), "GET" | "POST") {
        return Err("Desktop provider fetch supports only GET and POST.".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Provider URL must not include credentials.".to_string());
    }
    if request.url.len() > 2_048 {
        return Err("Provider URL is too long.".to_string());
    }
    if request.body.as_ref().map_or(0, |body| body.len()) > 1_000_000 {
        return Err("Provider request body exceeded the 1 MB limit.".to_string());
    }
    if request.headers.len() > 16 {
        return Err("Provider request has too many headers.".to_string());
    }
    if scheme == "https" {
        return Ok(());
    }
    if scheme == "http" && is_allowed_local_provider(host, url.port_or_known_default()) {
        return Ok(());
    }
    Err(
        "Desktop provider fetch allows HTTPS endpoints, plus local Ollama on 127.0.0.1:11434."
            .to_string(),
    )
}

fn is_allowed_local_provider(host: &str, port: Option<u16>) -> bool {
    matches!(host, "127.0.0.1" | "localhost") && port == Some(11434)
}

fn provider_fetch_headers(headers: &HashMap<String, String>) -> Result<HeaderMap, String> {
    let mut result = HeaderMap::new();
    for (name, value) in headers {
        let lower = name.to_ascii_lowercase();
        if !is_allowed_provider_header(&lower) {
            return Err(format!("Provider header is not allowed: {name}"));
        }
        if value.len() > 8_000 || value.contains('\r') || value.contains('\n') {
            return Err(format!("Provider header value is invalid: {name}"));
        }
        let header_name = HeaderName::from_bytes(lower.as_bytes())
            .map_err(|_| format!("Provider header name is invalid: {name}"))?;
        let header_value = HeaderValue::from_str(value)
            .map_err(|_| format!("Provider header value is invalid: {name}"))?;
        result.insert(header_name, header_value);
    }
    Ok(result)
}

fn is_allowed_provider_header(name: &str) -> bool {
    matches!(
        name,
        "accept"
            | "api-key"
            | "anthropic-version"
            | "authorization"
            | "content-type"
            | "openai-beta"
            | "x-api-key"
            | "x-dashscope-sse"
            | "x-goog-api-key"
    )
}

fn run_sandboxed_code_in_dir(
    request: &SandboxCodeRequest,
    work_dir: &Path,
    started: Instant,
) -> Result<SandboxExecutionResult, String> {
    let (runner, script_name) = match request.language {
        SandboxLanguage::Javascript => ("node", "snippet.js"),
        SandboxLanguage::Python => ("python", "snippet.py"),
    };
    let script_path = work_dir.join(script_name);
    fs::write(&script_path, request.code.as_bytes())
        .map_err(|error| format!("Could not write sandbox snippet: {error}"))?;

    let mut child = Command::new(runner)
        .arg(&script_path)
        .current_dir(work_dir)
        .env_clear()
        .env("NO_COLOR", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start sandbox runner: {error}"))?;

    if let Some(stdin) = &request.stdin {
        if let Some(mut child_stdin) = child.stdin.take() {
            child_stdin
                .write_all(stdin.as_bytes())
                .map_err(|error| format!("Could not write sandbox stdin: {error}"))?;
        }
    }

    let timeout = Duration::from_millis(request.timeout_ms.unwrap_or(5000).clamp(500, 10_000));
    loop {
        if started.elapsed() > timeout {
            let _ = child.kill();
            let output = child
                .wait_with_output()
                .map_err(|error| format!("Could not collect timed-out sandbox output: {error}"))?;
            return Ok(SandboxExecutionResult {
                exit_code: output.status.code(),
                stdout: limit_output(String::from_utf8_lossy(&output.stdout).to_string()),
                stderr: limit_output(String::from_utf8_lossy(&output.stderr).to_string()),
                duration_ms: started.elapsed().as_millis(),
                timed_out: true,
            });
        }
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Could not poll sandbox runner: {error}"))?
        {
            let output = child
                .wait_with_output()
                .map_err(|error| format!("Could not collect sandbox output: {error}"))?;
            return Ok(SandboxExecutionResult {
                exit_code: status.code(),
                stdout: limit_output(String::from_utf8_lossy(&output.stdout).to_string()),
                stderr: limit_output(String::from_utf8_lossy(&output.stderr).to_string()),
                duration_ms: started.elapsed().as_millis(),
                timed_out: false,
            });
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

fn create_sandbox_work_dir() -> Result<PathBuf, String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock error: {error}"))?
        .as_millis();
    let dir = std::env::temp_dir().join(format!("hello-world-sandbox-{stamp}"));
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create sandbox directory: {error}"))?;
    Ok(dir)
}

fn is_safe_env_ref(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.chars().enumerate().all(|(index, character)| {
            if index == 0 {
                character.is_ascii_uppercase()
            } else {
                character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
            }
        })
        && !value.contains("KEY")
        && !value.contains("TOKEN")
        && !value.contains("SECRET")
        && !value.contains("PASSWORD")
}

fn limit_output(value: String) -> String {
    value.chars().take(16_000).collect()
}

fn setup_desktop_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "show", "Show hello-world", true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "capture", "Capture screen", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &capture, &quit])?;

    let mut tray = TrayIconBuilder::with_id("hello-world")
        .tooltip("hello-world")
        .menu(&menu)
        .show_menu_on_left_click(false);

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.on_menu_event(|app, event| match event.id().as_ref() {
        "show" => show_main_window(app),
        "capture" => emit_capture_request(app, "tray"),
        "quit" => app.exit(0),
        _ => {}
    })
    .on_tray_icon_event(|tray, event| {
        if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        } = event
        {
            show_main_window(tray.app_handle());
        }
    })
    .build(app)?;
    Ok(())
}

fn setup_global_capture_shortcut(app: &tauri::AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || unsafe {
        let registered = RegisterHotKey(
            ptr::null_mut::<c_void>() as HWND,
            CAPTURE_HOTKEY_ID,
            MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT,
            u32::from(VK_H),
        ) != 0;
        GLOBAL_CAPTURE_SHORTCUT_REGISTERED.store(registered, Ordering::Relaxed);
        if !registered {
            return;
        }
        let mut message = MSG::default();
        while GetMessageW(&mut message, ptr::null_mut::<c_void>() as HWND, 0, 0) > 0 {
            if message.message == WM_HOTKEY && message.wParam == CAPTURE_HOTKEY_ID as usize {
                emit_capture_request(&app, "global-shortcut");
            }
        }
    });
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn emit_capture_request(app: &tauri::AppHandle, source: &str) {
    let _ = app.emit(
        CAPTURE_EVENT,
        DesktopCaptureRequest {
            source: source.to_string(),
        },
    );
}

fn validate_provider_id(provider_id: &str) -> Result<(), String> {
    let valid = !provider_id.is_empty()
        && provider_id.len() <= 128
        && provider_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | ':')
        });
    if valid {
        Ok(())
    } else {
        Err("Provider id contains unsupported characters.".to_string())
    }
}

fn credential_target(provider_id: &str) -> String {
    format!("hello-world/provider/{provider_id}")
}

fn to_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn write_provider_secret(provider_id: &str, secret: &str) -> Result<(), String> {
    let mut target = to_wide(&credential_target(provider_id));
    let mut username = to_wide("hello-world");
    let mut secret_bytes = secret.as_bytes().to_vec();
    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: target.as_mut_ptr(),
        CredentialBlobSize: secret_bytes
            .len()
            .try_into()
            .map_err(|_| "Provider secret is too large for the OS keychain.".to_string())?,
        CredentialBlob: secret_bytes.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        UserName: username.as_mut_ptr(),
        ..Default::default()
    };
    let ok = unsafe { CredWriteW(&credential, 0) != 0 };
    secret_bytes.fill(0);
    if ok {
        Ok(())
    } else {
        Err(format!(
            "Windows Credential Manager write failed: {}",
            unsafe { GetLastError() }
        ))
    }
}

fn read_provider_secret(provider_id: &str) -> Result<DesktopProviderSecretReadResult, String> {
    let target = to_wide(&credential_target(provider_id));
    let mut credential: *mut CREDENTIALW = ptr::null_mut();
    let ok = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) != 0 };
    if !ok {
        let error = unsafe { GetLastError() };
        if error == ERROR_NOT_FOUND {
            return Ok(DesktopProviderSecretReadResult {
                found: false,
                value: None,
            });
        }
        return Err(format!("Windows Credential Manager read failed: {error}"));
    }
    if credential.is_null() {
        return Ok(DesktopProviderSecretReadResult {
            found: false,
            value: None,
        });
    }
    let result = unsafe {
        let credential_ref = &*credential;
        let bytes = std::slice::from_raw_parts(
            credential_ref.CredentialBlob,
            credential_ref.CredentialBlobSize as usize,
        );
        String::from_utf8(bytes.to_vec())
            .map(|value| DesktopProviderSecretReadResult {
                found: true,
                value: Some(value),
            })
            .map_err(|_| "Stored provider secret is not valid UTF-8.".to_string())
    };
    unsafe { CredFree(credential as *const c_void) };
    result
}

fn delete_provider_secret(provider_id: &str) -> Result<(), String> {
    let target = to_wide(&credential_target(provider_id));
    let ok = unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) != 0 };
    if ok {
        return Ok(());
    }
    let error = unsafe { GetLastError() };
    if error == ERROR_NOT_FOUND {
        Ok(())
    } else {
        Err(format!("Windows Credential Manager delete failed: {error}"))
    }
}
