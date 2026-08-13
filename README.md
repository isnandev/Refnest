# RefNest

RefNest is a desktop visual reference vault for collecting, organizing, and
revisiting visual inspiration. Its application system lives in Bun rather than
in the Rust runtime.

```
React + shadcn/ui  ──invoke──▶  Rust shell  ──HTTP (loopback + token)──▶  Bun + Effect-TS
     (webview)                  (transport)                                 (the system)
```

Rust does four things and nothing else: it spawns the Bun sidecar, reads its
handshake, forwards one request at a time, and remembers which library
"forward" currently means. Every domain rule, contract, validation, error, and
piece of state lives in the Bun/Effect process. Moving a feature means editing
TypeScript, not Rust.

That fourth job exists so RefNest can browse a library on another machine. See
`ENVIRONMENTS.md`.

Workspace, notes, settings, and runtime-health flows form the application
baseline; the reference library, capture pipeline, AI enrichment, and MCP
access are RefNest's vault-specific features on top of it.

## Layout

| Path                                          | What lives there                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| `packages/contracts`                           | Effect `Schema` models and the `HttpApi` definition — the wire truth  |
| `apps/server`                                  | The system: services, layers, typed errors, HTTP handlers             |
| `apps/server/src/features/{references,folders,smart-folders,quick-save}` | Library domain: reference CRUD, folders, smart folders, capture jobs |
| `apps/server/src/features/{ai,assets}`         | AI provider settings/enrichment and hardened asset storage             |
| `apps/server/src/mcp`                          | MCP tool/resource registration and the stdio bridge                   |
| `apps/desktop/src-tauri`                       | The Rust shell: sidecar supervision and the IPC proxy                 |
| `apps/desktop/src`                             | React + Tailwind v4 + shadcn/ui, driving a generated Effect client    |
| `apps/desktop/src/features/library`            | Reference grid, folder tree, filters, inspector, quick save UI        |
| `scripts`                                      | Sidecar build and a headless smoke test of the whole chain            |

`RefNestApi` in `packages/contracts` is defined once. The server derives its
handlers from it and the desktop derives its client from it, so a contract change
fails the build on both sides instead of at runtime.

## Requirements

Bun, the Rust toolchain, and the [Tauri v2 system
prerequisites](https://tauri.app/start/prerequisites/) for your platform.

Website Quick Save also needs a local Chrome, Edge, or Chromium installation.
Set `REFNEST_CHROMIUM_EXECUTABLE` when it is not installed in a standard
location. The sidecar drives that executable through a loopback Chrome DevTools
connection; it does not require Node or `node_modules` at runtime, and a browser
executable is not downloaded or shipped. Social Quick Save uses `yt-dlp`:
RefNest checks `REFNEST_YT_DLP_PATH`, then the system `PATH`, and otherwise
downloads the official platform binary after verifying its published SHA-256
checksum. Set `REFNEST_YT_DLP_COOKIES_FROM_BROWSER` to a browser name/profile
accepted by `yt-dlp` when a signed-in source requires cookies.

## Commands

```bash
bun install

bun run dev            # compile the sidecar, then launch the desktop app
bun run build          # compile the sidecar, then bundle the installer
bun run sidecar:build  # compile the server and MCP stdio bridge binaries
bun run smoke          # boot both compiled binaries and exercise REST + MCP
bun run mcp:stdio      # run the stdio-to-live-sidecar MCP bridge
bun run typecheck      # tsc across every workspace
bun run test           # run each workspace's configured Vitest/Bun suites
bun run check:rust     # cargo check on the shell
```

`bun run dev` builds the sidecar first because Tauri resolves external binaries
by target triple at startup. Re-run `bun run sidecar:build` after changing
`apps/server` and before `bun run smoke`, or run `bun run server:dev` to iterate
on the server alone.

## How the handshake works

1. The sidecar binds `127.0.0.1` on an OS-assigned port and mints a fresh token.
2. It prints one line on stdout: `@refnest/handshake {"host":…,"port":…,"token":…}`.
3. The Rust shell parses that line and keeps the address and token in the host
   process. Neither ever reaches the webview.
4. `invoke("api_request", …)` accepts only a sidecar-relative path, attaches the
   bearer token, and returns the response verbatim.

Anything else on the machine that finds the port still gets a `401`.

`api_request` goes to whichever library is active; `api_request_local` always
goes to the sidecar this device spawned, which is where desktop settings, the
saved-library list, and sharing live. `activate_environment` takes an id, never
an address or a token: the shell reads the credential for a saved library from
the local sidecar over loopback, so it never reaches the webview.

## MCP access

RefNest exposes MCP protocol `2025-11-25` at `POST /mcp` on the same loopback
sidecar. It uses the same required bearer token as the REST API and the same live
Effect service graph and SQLite owner, so desktop and MCP clients can operate at
the same time. There is no unauthenticated MCP listener.

For an HTTP MCP client, start RefNest with an explicit loopback port and token so
the client has stable connection settings:

```text
REFNEST_SERVER_HOST=127.0.0.1
REFNEST_SERVER_PORT=4317
REFNEST_SERVER_TOKEN=<a long random secret>

URL: http://127.0.0.1:4317/mcp
Authorization: Bearer <the same secret>
```

Clients that require stdio should run the separately compiled
`refnest-mcp-stdio-<target>` binary, or `bun run mcp:stdio` during development,
with these environment variables:

```json
{
  "mcpServers": {
    "refnest": {
      "command": "C:\\path\\to\\refnest-mcp-stdio-x86_64-pc-windows-msvc.exe",
      "env": {
        "REFNEST_MCP_URL": "http://127.0.0.1:4317/mcp",
        "REFNEST_MCP_TOKEN": "<the same secret>"
      }
    }
  }
}
```

The stdio process is deliberately a bridge to the running authenticated
sidecar. It never opens the database, never logs to stdout, accepts only a
loopback `/mcp` URL, and exits when its input closes. RefNest must already be
running. The desktop's default port and token are random per launch, so external
clients need the explicit stable settings above; automatic credential discovery
is intentionally not provided. Protect any client configuration containing the
token because it grants full control of the local RefNest library.

MCP workspace creation is restricted to RefNest's managed workspace root. Every
tool operation is workspace-scoped, destructive tools require `confirm:true`,
Quick Save returns a queued job for later observation, and AI settings never
accept or return an API key. Asset and preview resources are verified by the
hardened asset service and are limited to 16 MiB per MCP read.

The server registers these tools:

```text
refnest_list_workspaces       refnest_create_workspace
refnest_list_folders          refnest_create_folder
refnest_update_folder         refnest_delete_folder
refnest_list_smart_folders    refnest_create_smart_folder
refnest_update_smart_folder   refnest_delete_smart_folder
refnest_search_references     refnest_get_reference
refnest_update_reference      refnest_trash_reference
refnest_restore_reference     refnest_quick_save
refnest_list_capture_jobs     refnest_get_capture_job
refnest_get_ai_settings       refnest_update_ai_settings
refnest_enrich_reference
```

Resources use `refnest://workspace/{workspaceId}`,
`refnest://workspace/{workspaceId}/folders`,
`refnest://reference/{referenceId}`, `refnest://asset/{referenceId}`, and
`refnest://preview/{referenceId}`.

## Adding a feature

1. Add the models and endpoint to `packages/contracts`.
2. Add a service and its layer under `apps/server/src/features/<feature>/`, and a
   thin `HttpApiBuilder.group` handler beside it.
3. Register the group in `apps/server/src/http/api.ts`.
4. Decide whether a device on the local network may reach it. If so, add the
   group to `RefNestSharedApi` and register a second handler layer in
   `apps/server/src/http/shared-api.ts` — the wiring is per-API, the service is
   not. If not, do nothing: absent is the default, and the safe one.
5. Add a hook under `apps/desktop/src/features/<feature>/` that calls the
   generated client through `appRuntime`, and keep the components render-only.
   Use `LocalApiClient` instead when the endpoint describes *this device*.

The Rust shell does not change for domain features.

## Settings storage

Desktop preferences and resume state are stored by the Bun sidecar in a SQLite
database named `settings.sqlite3`. The Rust shell resolves Tauri's app-local data
directory and passes that exact path to Bun; it does not read or write the data.

On Windows, the default location is:

```text
%LOCALAPPDATA%\studio.mavolo.refnest\settings.sqlite3
```

The saved document includes theme, sidebar appearance and width, the last active
page, native window position, size, and maximized state, which library is active,
and the selected workspace *per library* — a workspace id only means something
relative to one library, so a laptop must not resume into one that exists on the
host and nowhere else. Window bounds are checked against currently connected
monitors before they are restored.

These settings are always read from the sidecar this device spawned, even while
browsing a library on another machine: the window has to draw whether or not the
other machine is awake. A document written by an older build is migrated on read
rather than rejected.

## Library, capture, and AI storage

SQLite stores workspace, folder, reference, smart-folder, capture-job, and AI
provider metadata. A workspace is a real folder: creating, moving, renaming, or
removing a nested library folder performs the corresponding filesystem operation
and updates descendant asset paths transactionally. Captured assets remain inside
the selected workspace; generated previews live beside the app database.

Ordinary HTTP(S) URLs are rendered as a full-page screenshot of that single URL.
YouTube, Instagram, X, Pinterest, and Dribbble URLs are routed through `yt-dlp`,
with page metadata as a fallback when the source exposes a direct image or video.
Capture runs as a persisted background job and never crawls links from the page.

Local image, video, and PDF imports use `POST /references/import`. The desktop
picker — or a drop onto the window, which Tauri reports as absolute paths —
supplies one absolute path per request; the sidecar verifies the regular file,
signature, size, and destination before copying it into the selected workspace
folder. The original file is left unchanged.

Pasted content uses `POST /references/paste`, which carries the bytes instead of
a path because the clipboard has no file to point at. The same verification runs
either way: the signature is read from the bytes, the destination is contained,
and what landed is checked before the reference row is created. Both endpoints
are host-only — one names a path only this machine understands, and the other is
an upload the shared listener does not accept.

The OpenAI-compatible provider is configured through `GET`/`PUT /ai/settings`
with a base URL, model, optional API key, and enabled flag. The key is stored only
in the local SQLite database and is represented by `hasApiKey`—never the secret
itself—in API responses. Metadata enrichment can update a reference's title,
description, tags, palette, and suggested real folder.

## Reaching this library from another device

RefNest can serve its library to another device on the same local network, so a
laptop can browse and edit what a desktop stores. This is remote access, not
sync: one machine owns the database and the files, so there is no merge and no
offline mode.

Sharing is off until you turn it on in Settings. Enabling it starts a second
listener (`0.0.0.0:4317` by default) that serves a deliberately smaller
contract — no workspace administration, no local file import, no AI provider
settings, no desktop settings, no MCP. Those groups are absent from the shared
contract rather than blocked by a check.

A second device is added with a code: the host shows an eight-character pairing
code that expires in five minutes and can be redeemed once, and the device that
redeems it receives its own token, listed and revocable under Paired devices.
The pairing endpoint exists only while a code is outstanding.

Traffic on the shared listener is plain HTTP. Anyone who can observe the network
can read a device token and the reference bytes, so this is meant for a home or
studio network and not for guest or public wireless. The listener refuses any
peer outside the private ranges, and nothing binds until sharing is enabled.

`ENVIRONMENTS.md` records the architecture, the decisions, and what remains
unproven.

## Design

`DESIGN.md` records the visual direction and the project-specific decisions.
Tokens are declared in `apps/desktop/src/index.css`; `components.json` is
configured, so `bunx shadcn@latest add <component>` works from `apps/desktop`.
