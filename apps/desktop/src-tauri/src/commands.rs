//! The whole IPC surface: wait for the sidecar, then forward one request.

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State};

use crate::endpoint::{ActiveEndpoint, LOCAL_ENVIRONMENT_ID};
use crate::proxy::{ApiProxy, ApiRequest, ApiResponse};
use crate::sidecar::Sidecar;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConnectionInfo {
    url: String,
    token: String,
}

fn mcp_connection(endpoint: crate::sidecar::Endpoint) -> McpConnectionInfo {
    McpConnectionInfo {
        url: format!("{}/mcp", endpoint.base_url.trim_end_matches('/')),
        token: endpoint.token,
    }
}

/// Goes to whichever library is active — this device's, or one on the network.
#[tauri::command]
pub async fn api_request(
    sidecar: State<'_, Sidecar>,
    proxy: State<'_, ApiProxy>,
    active: State<'_, ActiveEndpoint>,
    request: ApiRequest,
) -> Result<ApiResponse, String> {
    let local = sidecar.endpoint().await?;

    proxy.forward(&active.resolve(&local), request).await
}

/// Always goes to the sidecar this device spawned.
///
/// Window bounds, appearance, the saved library list, and sharing belong to the
/// machine in front of the user, and have to resolve before any network does.
#[tauri::command]
pub async fn api_request_local(
    sidecar: State<'_, Sidecar>,
    proxy: State<'_, ApiProxy>,
    request: ApiRequest,
) -> Result<ApiResponse, String> {
    let endpoint = sidecar.endpoint().await?;

    proxy.forward(&endpoint, request).await
}

/// Points `api_request` at a saved library. The webview passes an id; the
/// address and token are read from the local sidecar and stay in this process.
#[tauri::command]
pub async fn activate_environment(
    sidecar: State<'_, Sidecar>,
    proxy: State<'_, ApiProxy>,
    active: State<'_, ActiveEndpoint>,
    environment_id: String,
) -> Result<(), String> {
    if environment_id == LOCAL_ENVIRONMENT_ID {
        return active.set_local();
    }

    let local = sidecar.endpoint().await?;

    active.activate(&local, &proxy, &environment_id).await
}

#[tauri::command]
pub fn sidecar_ready(sidecar: State<'_, Sidecar>) -> bool {
    sidecar.is_ready()
}

/// Reveals the ephemeral local MCP credential only after the Settings UI
/// explicitly requests it. The local endpoint follows the active library.
#[tauri::command]
pub async fn mcp_connection_info(sidecar: State<'_, Sidecar>) -> Result<McpConnectionInfo, String> {
    Ok(mcp_connection(sidecar.endpoint().await?))
}

/// Local OS toast. A body-click focuses the main window — the JS plugin cannot.
#[tauri::command]
pub fn show_desktop_notification<R: Runtime>(
    app: AppHandle<R>,
    title: String,
    body: String,
) {
    let identifier = app.config().identifier.clone();

    std::thread::spawn(move || {
        let mut notification = notify_rust::Notification::new();
        notification.summary(&title).body(&body);

        #[cfg(target_os = "windows")]
        {
            if let Ok(exe) = tauri::utils::platform::current_exe() {
                if let Some(dir) = exe.parent() {
                    let curr = dir.display().to_string();
                    let sep = std::path::MAIN_SEPARATOR;
                    if !(curr.ends_with(&format!("{sep}target{sep}debug"))
                        || curr.ends_with(&format!("{sep}target{sep}release")))
                    {
                        notification.app_id(&identifier);
                    }
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            let _ = notify_rust::set_application(if tauri::is_dev() {
                "com.apple.Terminal"
            } else {
                &identifier
            });
        }

        let Ok(handle) = notification.show() else {
            return;
        };

        let _ = handle.wait_for_response(|response: &notify_rust::NotificationResponse| {
            if matches!(response, notify_rust::NotificationResponse::Closed(_)) {
                return;
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        });
    });
}

#[cfg(test)]
mod tests {
    use super::mcp_connection;
    use crate::sidecar::Endpoint;

    #[test]
    fn builds_the_mcp_url_from_the_live_sidecar_endpoint() {
        let connection = mcp_connection(Endpoint {
            base_url: "http://127.0.0.1:4317".to_string(),
            token: "local-secret".to_string(),
        });

        assert_eq!(connection.url, "http://127.0.0.1:4317/mcp");
        assert_eq!(connection.token, "local-secret");
    }
}
