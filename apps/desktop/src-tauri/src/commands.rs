//! The whole IPC surface: wait for the sidecar, then forward one request.

use tauri::State;

use crate::proxy::{ApiProxy, ApiRequest, ApiResponse};
use crate::sidecar::Sidecar;

#[tauri::command]
pub async fn api_request(
    sidecar: State<'_, Sidecar>,
    proxy: State<'_, ApiProxy>,
    request: ApiRequest,
) -> Result<ApiResponse, String> {
    let endpoint = sidecar.endpoint().await?;

    proxy.forward(&endpoint, request).await
}

#[tauri::command]
pub fn sidecar_ready(sidecar: State<'_, Sidecar>) -> bool {
    sidecar.is_ready()
}
