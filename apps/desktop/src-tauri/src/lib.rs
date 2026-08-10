mod commands;
mod proxy;
mod sidecar;

use tauri::{Manager, RunEvent};

use crate::proxy::ApiProxy;
use crate::sidecar::Sidecar;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            app.manage(Sidecar::spawn(app.handle())?);
            app.manage(ApiProxy::new());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::api_request,
            commands::sidecar_ready
        ])
        .build(tauri::generate_context!())
        .expect("error while building the tauri application")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                app.state::<Sidecar>().shutdown();
            }
        });
}
