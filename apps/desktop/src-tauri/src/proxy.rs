//! Forwards webview calls to the sidecar.
//!
//! This is a transport, not a policy layer: it attaches the bearer token, keeps
//! the request on the sidecar's own origin, and hands the response back
//! unchanged. Status codes and error bodies are the sidecar's to decide.

use std::collections::HashMap;
use std::time::Duration;

use reqwest::{Client, Method};
use serde::{Deserialize, Serialize};

use crate::sidecar::Endpoint;

/// Generous enough for a Quick Save job to be accepted and for a large asset to
/// stream off another machine, short enough that a sleeping host surfaces as an
/// error instead of a spinner that never resolves. Loopback never needed one.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Deserialize)]
pub struct ApiRequest {
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
pub struct ApiResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

pub struct ApiProxy {
    http: Client,
}

impl Default for ApiProxy {
    fn default() -> Self {
        Self {
            http: Client::builder()
                .timeout(REQUEST_TIMEOUT)
                .build()
                .unwrap_or_default(),
        }
    }
}

impl ApiProxy {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn forward(
        &self,
        endpoint: &Endpoint,
        request: ApiRequest,
    ) -> Result<ApiResponse, String> {
        self.forward_with_limit(endpoint, request, None).await
    }

    /// Forwards a response while stopping before an untrusted peer can buffer
    /// more than the caller's boundary permits.
    pub async fn forward_bounded(
        &self,
        endpoint: &Endpoint,
        request: ApiRequest,
        max_response_bytes: usize,
    ) -> Result<ApiResponse, String> {
        if max_response_bytes == 0 {
            return Err("the response byte limit must be positive".to_string());
        }

        self.forward_with_limit(endpoint, request, Some(max_response_bytes))
            .await
    }

    async fn forward_with_limit(
        &self,
        endpoint: &Endpoint,
        request: ApiRequest,
        max_response_bytes: Option<usize>,
    ) -> Result<ApiResponse, String> {
        let method = parse_method(&request.method)?;
        let url = resolve_url(&endpoint.base_url, &request.path)?;

        let mut outgoing = self.http.request(method, url).bearer_auth(&endpoint.token);

        for (name, value) in request.headers {
            // The token is the shell's to set; a webview must not override it.
            if name.eq_ignore_ascii_case("authorization") {
                continue;
            }

            outgoing = outgoing.header(name, value);
        }

        if let Some(body) = request.body {
            outgoing = outgoing.body(body);
        }

        let mut response = outgoing
            .send()
            .await
            .map_err(|error| format!("the sidecar did not answer: {error}"))?;

        if let (Some(limit), Some(length)) = (max_response_bytes, response.content_length()) {
            if length > limit as u64 {
                return Err("the sidecar response exceeded its byte limit".to_string());
            }
        }

        let status = response.status().as_u16();
        let headers = response
            .headers()
            .iter()
            .filter_map(|(name, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|value| (name.as_str().to_string(), value.to_string()))
            })
            .collect();
        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("could not read the sidecar response: {error}"))?
        {
            let next_length = body
                .len()
                .checked_add(chunk.len())
                .ok_or_else(|| "the sidecar response size overflowed".to_string())?;
            if max_response_bytes.is_some_and(|limit| next_length > limit) {
                return Err("the sidecar response exceeded its byte limit".to_string());
            }
            body.extend_from_slice(&chunk);
        }

        Ok(ApiResponse {
            status,
            headers,
            body,
        })
    }
}

fn parse_method(method: &str) -> Result<Method, String> {
    match method.to_ascii_uppercase().as_str() {
        "GET" => Ok(Method::GET),
        "POST" => Ok(Method::POST),
        "PUT" => Ok(Method::PUT),
        "PATCH" => Ok(Method::PATCH),
        "DELETE" => Ok(Method::DELETE),
        "HEAD" => Ok(Method::HEAD),
        other => Err(format!("unsupported method: {other}")),
    }
}

/// Concatenation rather than `Url::join`, because joining a protocol-relative
/// path such as `//example.com/x` would move the request to another host.
fn resolve_url(base_url: &str, path: &str) -> Result<String, String> {
    if !path.starts_with('/') || path.starts_with("//") {
        return Err(format!("path must be sidecar-relative, got: {path}"));
    }

    Ok(format!("{base_url}{path}"))
}

#[cfg(test)]
mod tests {
    use super::{parse_method, resolve_url};

    #[test]
    fn resolves_a_sidecar_relative_path() {
        assert_eq!(
            resolve_url("http://127.0.0.1:5000", "/notes").unwrap(),
            "http://127.0.0.1:5000/notes"
        );
    }

    #[test]
    fn rejects_paths_that_could_leave_the_sidecar() {
        assert!(resolve_url("http://127.0.0.1:5000", "//example.com/x").is_err());
        assert!(resolve_url("http://127.0.0.1:5000", "http://example.com/x").is_err());
    }

    #[test]
    fn rejects_an_unsupported_method() {
        assert!(parse_method("get").is_ok());
        assert!(parse_method("TRACE").is_err());
    }
}
