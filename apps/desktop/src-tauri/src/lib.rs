mod commands;
mod endpoint;
mod media_protocol;
mod proxy;
mod sidecar;

use tauri::{Manager, RunEvent};

use crate::endpoint::ActiveEndpoint;
use crate::proxy::ApiProxy;
use crate::sidecar::Sidecar;

/// Windows: the frameless shell blurs the desktop behind the window with an
/// acrylic backdrop, falling back to mica on builds without system backdrop.
#[cfg(target_os = "windows")]
fn apply_vibrancy(app: &tauri::App) {
    use window_vibrancy::{apply_acrylic, apply_mica};

    if let Some(window) = app.get_webview_window("main") {
        // The tint is kept near-zero so the app's own themed stage color
        // (semi-transparent in CSS) provides the visible backdrop tint.
        if apply_acrylic(&window, Some((0, 0, 0, 24))).is_err() {
            let _ = apply_mica(&window, None);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .register_asynchronous_uri_scheme_protocol(
            "refnest-media",
            |context, request, responder| {
                media_protocol::respond(
                    context.app_handle().clone(),
                    context.webview_label(),
                    request,
                    responder,
                );
            },
        )
        .setup(|app| {
            #[cfg(target_os = "windows")]
            apply_vibrancy(app);

            app.manage(Sidecar::spawn(app.handle())?);
            app.manage(ApiProxy::new());
            app.manage(ActiveEndpoint::new());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::api_request,
            commands::api_request_local,
            commands::activate_environment,
            commands::sidecar_ready,
            commands::mcp_connection_info,
            commands::show_desktop_notification
        ])
        .build(tauri::generate_context!())
        .expect("error while building the tauri application")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                app.state::<Sidecar>().shutdown();
            }
        });
}
