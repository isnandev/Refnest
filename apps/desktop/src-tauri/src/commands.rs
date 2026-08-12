//! The whole IPC surface: wait for the sidecar, then forward one request.

use tauri::State;

use crate::endpoint::{ActiveEndpoint, LOCAL_ENVIRONMENT_ID};
use crate::proxy::{ApiProxy, ApiRequest, ApiResponse};
use crate::sidecar::Sidecar;

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
