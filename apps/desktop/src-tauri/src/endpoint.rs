//! Which library the webview's calls currently go to.
//!
//! The shell keeps two endpoints: the sidecar it spawned, which always exists
//! and always owns this device's settings, and the *active* one, which may be a
//! RefNest on another machine. The webview names a library by id and never sees
//! an address or a token — the credential for a remote library is fetched from
//! the local sidecar, over loopback, with the local token.

use std::sync::Mutex;

use serde::Deserialize;

use crate::proxy::ApiProxy;
use crate::sidecar::Endpoint;

/// Must match `LOCAL_ENVIRONMENT_ID` in `@refnest/contracts`.
pub const LOCAL_ENVIRONMENT_ID: &str = "local";

#[derive(Debug, Deserialize)]
struct Connection {
    #[serde(rename = "baseUrl")]
    base_url: String,
    token: String,
}

/// `None` means the local sidecar, which is resolved fresh on every call so a
/// restarted sidecar is picked up without re-activating.
#[derive(Default)]
pub struct ActiveEndpoint {
    remote: Mutex<Option<Endpoint>>,
}

impl ActiveEndpoint {
    pub fn new() -> Self {
        Self::default()
    }

    /// Resolves the endpoint a domain request should go to.
    pub fn resolve(&self, local: &Endpoint) -> Endpoint {
        match self.remote.lock() {
            Ok(guard) => guard.clone().unwrap_or_else(|| local.clone()),
            // A poisoned lock means a panic while switching libraries. Falling
            // back to local is the safe direction: worst case the user sees
            // their own library instead of someone else's.
            Err(_) => local.clone(),
        }
    }

    pub fn set_local(&self) -> Result<(), String> {
        let mut guard = self
            .remote
            .lock()
            .map_err(|_| "the active library could not be updated".to_string())?;
        *guard = None;
        Ok(())
    }

    /// Asks the local sidecar for a saved library's address and credential.
    pub async fn activate(
        &self,
        local: &Endpoint,
        proxy: &ApiProxy,
        environment_id: &str,
    ) -> Result<(), String> {
        let connection = fetch_connection(local, proxy, environment_id).await?;

        let mut guard = self
            .remote
            .lock()
            .map_err(|_| "the active library could not be updated".to_string())?;
        *guard = Some(Endpoint {
            base_url: connection.base_url,
            token: connection.token,
        });

        Ok(())
    }
}

async fn fetch_connection(
    local: &Endpoint,
    proxy: &ApiProxy,
    environment_id: &str,
) -> Result<Connection, String> {
    if !is_safe_id(environment_id) {
        return Err(format!("unusable library id: {environment_id}"));
    }

    let response = proxy
        .forward(
            local,
            crate::proxy::ApiRequest {
                method: "GET".to_string(),
                path: format!("/environments/{environment_id}/connection"),
                body: None,
                headers: Default::default(),
            },
        )
        .await?;

    if response.status != 200 {
        return Err(format!(
            "the saved library could not be opened ({})",
            response.status
        ));
    }

    serde_json::from_slice::<Connection>(&response.body)
        .map_err(|error| format!("the saved library returned an unreadable connection: {error}"))
}

/// The id goes into a URL path. RefNest mints UUIDs, so anything outside this
/// alphabet is a caller bug rather than something to escape and carry on with.
fn is_safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[cfg(test)]
mod tests {
    use super::{is_safe_id, ActiveEndpoint, LOCAL_ENVIRONMENT_ID};
    use crate::sidecar::Endpoint;

    fn endpoint(base_url: &str) -> Endpoint {
        Endpoint {
            base_url: base_url.to_string(),
            token: "token".to_string(),
        }
    }

    #[test]
    fn resolves_to_the_local_sidecar_by_default() {
        let active = ActiveEndpoint::new();
        let local = endpoint("http://127.0.0.1:5000");

        assert_eq!(active.resolve(&local).base_url, "http://127.0.0.1:5000");
    }

    #[test]
    fn returning_to_local_forgets_the_remote() {
        let active = ActiveEndpoint::new();
        let local = endpoint("http://127.0.0.1:5000");

        *active.remote.lock().unwrap() = Some(endpoint("http://192.168.1.20:4317"));
        assert_eq!(active.resolve(&local).base_url, "http://192.168.1.20:4317");

        active.set_local().unwrap();
        assert_eq!(active.resolve(&local).base_url, "http://127.0.0.1:5000");
    }

    #[test]
    fn rejects_ids_that_could_reshape_the_path() {
        assert!(is_safe_id(LOCAL_ENVIRONMENT_ID));
        assert!(is_safe_id("0b0d5b62-2c1f-4b5f-9a2a-1d4f6f0f8b21"));
        assert!(!is_safe_id("../sharing"));
        assert!(!is_safe_id("a/b"));
        assert!(!is_safe_id(""));
    }
}
