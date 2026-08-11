# Tauri Effect Starter

A desktop starter where **the system lives in Bun, not in the Rust runtime**.

```
React + shadcn/ui  ──invoke──▶  Rust shell  ──HTTP (loopback + token)──▶  Bun + Effect-TS
     (webview)                  (transport)                                 (the system)
```

Rust does three things and nothing else: it spawns the Bun sidecar, reads its
handshake, and forwards one request at a time. Every domain rule, contract,
validation, error, and piece of state lives in the Bun/Effect process. Moving a
feature means editing TypeScript, not Rust.

## Layout

| Path                            | What lives there                                                     |
| ------------------------------- | -------------------------------------------------------------------- |
| `packages/contracts`            | Effect `Schema` models and the `HttpApi` definition — the wire truth  |
| `apps/server`                   | The system: services, layers, typed errors, HTTP handlers             |
| `apps/desktop/src-tauri`        | The Rust shell: sidecar supervision and the IPC proxy                 |
| `apps/desktop/src`              | React + Tailwind v4 + shadcn/ui, driving a generated Effect client    |
| `scripts`                       | Sidecar build and a headless smoke test of the whole chain            |

`StarterApi` in `packages/contracts` is defined once. The server derives its
handlers from it and the desktop derives its client from it, so a contract change
fails the build on both sides instead of at runtime.

## Requirements

Bun, the Rust toolchain, and the [Tauri v2 system
prerequisites](https://tauri.app/start/prerequisites/) for your platform.

## Commands

```bash
bun install

bun run dev            # compile the sidecar, then launch the desktop app
bun run build          # compile the sidecar, then bundle the installer
bun run sidecar:build  # compile apps/server into a single-file Bun binary
bun run smoke          # boot the sidecar headlessly and exercise the API
bun run typecheck      # tsc across every workspace
bun run test           # vitest across every workspace
bun run check:rust     # cargo check on the shell
```

`bun run dev` builds the sidecar first because Tauri resolves external binaries
by target triple at startup. Re-run `bun run sidecar:build` after changing
`apps/server`, or run `bun run server:dev` to iterate on the server alone.

## How the handshake works

1. The sidecar binds `127.0.0.1` on an OS-assigned port and mints a fresh token.
2. It prints one line on stdout: `@starter/handshake {"host":…,"port":…,"token":…}`.
3. The Rust shell parses that line and keeps the address and token in the host
   process. Neither ever reaches the webview.
4. `invoke("api_request", …)` accepts only a sidecar-relative path, attaches the
   bearer token, and returns the response verbatim.

Anything else on the machine that finds the port still gets a `401`.

## Adding a feature

1. Add the models and endpoint to `packages/contracts`.
2. Add a service and its layer under `apps/server/src/features/<feature>/`, and a
   thin `HttpApiBuilder.group` handler beside it.
3. Register the group in `apps/server/src/http/api.ts`.
4. Add a hook under `apps/desktop/src/features/<feature>/` that calls the
   generated client through `appRuntime`, and keep the components render-only.

The Rust shell does not change for domain features.

## Settings storage

Desktop preferences and resume state are stored by the Bun sidecar in a SQLite
database named `settings.sqlite3`. The Rust shell resolves Tauri's app-local data
directory and passes that exact path to Bun; it does not read or write the data.

On Windows, the default location is:

```text
%LOCALAPPDATA%\studio.mavolo.tauri-effect-starter\settings.sqlite3
```

The saved document includes theme, sidebar appearance and width, the selected
workspace, the last active page, and native window position, size, and maximized
state. Window bounds are checked against currently connected monitors before they
are restored.

## Design

`DESIGN.md` records the visual direction and the project-specific decisions.
Tokens are declared in `apps/desktop/src/index.css`; `components.json` is
configured, so `bunx shadcn@latest add <component>` works from `apps/desktop`.
