//! Authenticated, range-bounded media delivery for the webview.
//!
//! Video bytes stay out of Tauri command serialization. The webview receives
//! only a custom-protocol URL; this handler attaches the active library's
//! credential and forwards one bounded byte range at a time.

use percent_encoding::percent_decode_str;
use std::collections::HashMap;
use tauri::http::header::{
    HeaderName, HeaderValue, ACCESS_CONTROL_ALLOW_ORIGIN, CONTENT_TYPE, RANGE,
};
use tauri::http::{Method, Request, Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime, UriSchemeResponder};

use crate::endpoint::ActiveEndpoint;
use crate::proxy::{ApiProxy, ApiRequest, ApiResponse};
use crate::sidecar::Sidecar;

const MAIN_WEBVIEW_LABEL: &str = "main";
const DEFAULT_MEDIA_RANGE: &str = "bytes=0-";
const MAX_MEDIA_RESPONSE_BYTES: usize = 1_024 * 1_024;
const FORWARDED_RESPONSE_HEADERS: [&str; 7] = [
    "accept-ranges",
    "cache-control",
    "content-length",
    "content-range",
    "content-security-policy",
    "content-type",
    "x-content-type-options",
];

pub fn respond<R: Runtime>(
    app: AppHandle<R>,
    webview_label: &str,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let request = match media_api_request(webview_label, &request) {
        Ok(request) => request,
        Err((status, message)) => {
            responder.respond(error_response(status, message));
            return;
        }
    };

    tauri::async_runtime::spawn(async move {
        let response = match forward_media(&app, request).await {
            Ok(response) => api_response(response),
            Err(()) => error_response(
                StatusCode::BAD_GATEWAY,
                "The video range could not be loaded.",
            ),
        };
        responder.respond(response);
    });
}

fn media_api_request(
    webview_label: &str,
    request: &Request<Vec<u8>>,
) -> Result<ApiRequest, (StatusCode, &'static str)> {
    if webview_label != MAIN_WEBVIEW_LABEL {
        return Err((StatusCode::FORBIDDEN, "This webview cannot load media."));
    }
    if request.method() != Method::GET {
        return Err((StatusCode::METHOD_NOT_ALLOWED, "Only GET is supported."));
    }

    let path = decode_asset_path(request.uri().path())
        .ok_or((StatusCode::BAD_REQUEST, "The media path is invalid."))?;
    let range = request
        .headers()
        .get(RANGE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or(DEFAULT_MEDIA_RANGE);
    if !is_single_byte_range(range) {
        return Err((StatusCode::BAD_REQUEST, "The media range is invalid."));
    }

    let mut headers = HashMap::new();
    headers.insert("range".to_string(), range.to_string());

    Ok(ApiRequest {
        method: "GET".to_string(),
        path,
        body: None,
        headers,
    })
}

async fn forward_media<R: Runtime>(
    app: &AppHandle<R>,
    request: ApiRequest,
) -> Result<ApiResponse, ()> {
    let local = app.state::<Sidecar>().endpoint().await.map_err(|_| ())?;
    let endpoint = app.state::<ActiveEndpoint>().resolve(&local);
    app.state::<ApiProxy>()
        .forward_bounded(&endpoint, request, MAX_MEDIA_RESPONSE_BYTES)
        .await
        .map_err(|_| ())
}

fn decode_asset_path(encoded_path: &str) -> Option<String> {
    let encoded = encoded_path.strip_prefix('/')?;
    let decoded = percent_decode_str(encoded).decode_utf8().ok()?;
    let segments = decoded.split('/').collect::<Vec<_>>();

    if segments.len() != 7
        || segments[0] != ""
        || segments[1] != "workspaces"
        || !is_safe_id(segments[2])
        || segments[3] != "references"
        || !is_safe_id(segments[4])
        || segments[5] != "assets"
        || segments[6] != "asset"
    {
        return None;
    }

    Some(decoded.into_owned())
}

fn is_safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

fn is_single_byte_range(value: &str) -> bool {
    if value.len() > 64 {
        return false;
    }
    let Some(offsets) = value.strip_prefix("bytes=") else {
        return false;
    };
    let mut parts = offsets.split('-');
    let Some(start) = parts.next() else {
        return false;
    };
    let Some(end) = parts.next() else {
        return false;
    };

    parts.next().is_none()
        && (!start.is_empty() || !end.is_empty())
        && start.chars().all(|character| character.is_ascii_digit())
        && end.chars().all(|character| character.is_ascii_digit())
}

fn api_response(response: ApiResponse) -> Response<Vec<u8>> {
    let status = StatusCode::from_u16(response.status).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut output = Response::new(response.body);
    *output.status_mut() = status;

    for name in FORWARDED_RESPONSE_HEADERS {
        let Some(value) = response.headers.get(name) else {
            continue;
        };
        let Ok(value) = HeaderValue::from_str(value) else {
            continue;
        };
        output
            .headers_mut()
            .insert(HeaderName::from_static(name), value);
    }
    output
        .headers_mut()
        .insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    output
}

fn error_response(status: StatusCode, message: &'static str) -> Response<Vec<u8>> {
    let mut response = Response::new(message.as_bytes().to_vec());
    *response.status_mut() = status;
    response.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    response
}

#[cfg(test)]
mod tests {
    use tauri::http::{Method, Request};

    use super::{decode_asset_path, is_single_byte_range, media_api_request};

    const ENCODED_ASSET_PATH: &str =
        "/%2Fworkspaces%2Fworkspace_1%2Freferences%2Freference_2%2Fassets%2Fasset";

    #[test]
    fn decodes_only_canonical_reference_asset_routes() {
        assert_eq!(
            decode_asset_path(ENCODED_ASSET_PATH),
            Some("/workspaces/workspace_1/references/reference_2/assets/asset".to_string())
        );
        assert!(decode_asset_path("/%2Fhealth").is_none());
        assert!(decode_asset_path(
            "/%2Fworkspaces%2Fworkspace_1%2Freferences%2F..%2Fassets%2Fasset"
        )
        .is_none());
        assert!(decode_asset_path(
            "/%2Fworkspaces%2Fworkspace_1%2Freferences%2Freference_2%2Fassets%2Fpreview"
        )
        .is_none());
    }

    #[test]
    fn accepts_one_standard_byte_range() {
        assert!(is_single_byte_range("bytes=0-"));
        assert!(is_single_byte_range("bytes=100-200"));
        assert!(is_single_byte_range("bytes=-512"));
        assert!(!is_single_byte_range("bytes=0-1,4-5"));
        assert!(!is_single_byte_range("items=0-1"));
        assert!(!is_single_byte_range("bytes=-"));
    }

    #[test]
    fn turns_the_main_webview_request_into_a_scoped_authenticated_proxy_call() {
        let request = Request::builder()
            .method(Method::GET)
            .uri(format!("refnest-media://localhost{ENCODED_ASSET_PATH}"))
            .header("range", "bytes=4096-")
            .body(Vec::new())
            .unwrap();

        let forwarded = media_api_request("main", &request).unwrap();
        assert_eq!(
            forwarded.path,
            "/workspaces/workspace_1/references/reference_2/assets/asset"
        );
        assert_eq!(forwarded.headers.get("range").unwrap(), "bytes=4096-");

        let wrong_webview = media_api_request("secondary", &request).unwrap_err();
        assert_eq!(wrong_webview.0.as_u16(), 403);
    }
}
