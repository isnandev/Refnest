//! Supervises the Bun/Effect sidecar process.
//!
//! The shell owns the process lifetime and the handshake; it holds no
//! application logic. Everything the app can actually *do* lives in the sidecar.

use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::watch;

/// Matches `externalBin` in tauri.conf.json and the output of `bun run sidecar:build`.
const SIDECAR_BIN: &str = "starter-server";

/// Must match `HANDSHAKE_PREFIX` in `@starter/contracts`.
const HANDSHAKE_PREFIX: &str = "@starter/handshake ";

const READY_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Deserialize)]
struct Handshake {
    host: String,
    port: u16,
    token: String,
}

/// Where the sidecar listens and the secret that authorises calls to it.
/// This never crosses into the webview.
#[derive(Clone, Debug)]
pub struct Endpoint {
    pub base_url: String,
    pub token: String,
}

pub struct Sidecar {
    ready: watch::Receiver<Option<Endpoint>>,
    child: Mutex<Option<CommandChild>>,
}

impl Sidecar {
    /// Spawns the sidecar and starts reading its output. Returns immediately;
    /// callers wait for the handshake through [`Sidecar::endpoint`].
    pub fn spawn<R: Runtime>(app: &AppHandle<R>) -> Result<Self, String> {
        let (ready_tx, ready_rx) = watch::channel(None);
        let data_dir = app
            .path()
            .app_local_data_dir()
            .map_err(|error| format!("could not resolve the app data directory: {error}"))?;

        std::fs::create_dir_all(&data_dir)
            .map_err(|error| format!("could not create the app data directory: {error}"))?;

        let database_path = data_dir.join("settings.sqlite3");

        let (mut events, child) = app
            .shell()
            .sidecar(SIDECAR_BIN)
            .map_err(|error| format!("could not resolve the {SIDECAR_BIN} sidecar: {error}"))?
            .env("STARTER_DATABASE_PATH", &database_path)
            .spawn()
            .map_err(|error| format!("could not start the {SIDECAR_BIN} sidecar: {error}"))?;

        tauri::async_runtime::spawn(async move {
            while let Some(event) = events.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        let line = String::from_utf8_lossy(&bytes).trim().to_string();

                        match line.strip_prefix(HANDSHAKE_PREFIX) {
                            Some(json) => match serde_json::from_str::<Handshake>(json) {
                                Ok(handshake) => {
                                    let _ = ready_tx.send(Some(Endpoint {
                                        base_url: format!(
                                            "http://{}:{}",
                                            handshake.host, handshake.port
                                        ),
                                        token: handshake.token,
                                    }));
                                }
                                Err(error) => {
                                    eprintln!("sidecar: unreadable handshake: {error}");
                                }
                            },
                            None => println!("sidecar: {line}"),
                        }
                    }
                    CommandEvent::Stderr(bytes) => {
                        eprintln!("sidecar: {}", String::from_utf8_lossy(&bytes).trim());
                    }
                    CommandEvent::Terminated(payload) => {
                        eprintln!("sidecar: exited with {:?}", payload.code);
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(Self {
            ready: ready_rx,
            child: Mutex::new(Some(child)),
        })
    }

    /// True once the handshake has been read. Used by the UI to show a boot state.
    pub fn is_ready(&self) -> bool {
        self.ready.borrow().is_some()
    }

    /// Resolves once the sidecar is listening, or fails if it dies or stalls.
    pub async fn endpoint(&self) -> Result<Endpoint, String> {
        let mut ready = self.ready.clone();

        let wait = async {
            loop {
                let current = ready.borrow().clone();

                if let Some(endpoint) = current {
                    return Ok(endpoint);
                }

                if ready.changed().await.is_err() {
                    return Err("the sidecar stopped before it was ready".to_string());
                }
            }
        };

        tokio::time::timeout(READY_TIMEOUT, wait)
            .await
            .map_err(|_| "the sidecar did not report a handshake in time".to_string())?
    }

    /// Stops the child so it cannot outlive the window that spawned it.
    pub fn shutdown(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}
