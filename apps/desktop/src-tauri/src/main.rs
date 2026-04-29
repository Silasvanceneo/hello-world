use std::{
    net::{SocketAddr, TcpStream},
    time::Duration,
};

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

#[tauri::command]
fn desktop_native_capabilities() -> DesktopNativeCapabilities {
    DesktopNativeCapabilities {
        screen_capture: true,
        clipboard_image: true,
        global_shortcut: false,
        tray: false,
        keychain: false,
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            desktop_native_capabilities,
            detect_local_ollama
        ])
        .run(tauri::generate_context!())
        .expect("error while running hello-world desktop shell");
}
