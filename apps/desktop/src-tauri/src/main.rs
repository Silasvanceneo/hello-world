#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    ffi::c_void,
    net::{SocketAddr, TcpStream},
    ptr,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
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

#[tauri::command]
fn desktop_native_capabilities() -> DesktopNativeCapabilities {
    DesktopNativeCapabilities {
        screen_capture: true,
        clipboard_image: true,
        global_shortcut: GLOBAL_CAPTURE_SHORTCUT_REGISTERED.load(Ordering::Relaxed),
        tray: true,
        keychain: true,
        local_ollama_detection: true,
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
            delete_desktop_provider_secret
        ])
        .run(tauri::generate_context!())
        .expect("error while running hello-world desktop shell");
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
