# Environments and local-network sharing

RefNest is a single-machine vault. This document describes how a second device
reaches the same library over a local network, and the decisions that shape it.

```
Laptop                                   PC (host)
┌──────────────┐                        ┌──────────────────────────────┐
│ webview      │                        │ Bun sidecar                  │
│   ↓ invoke   │                        │  device listener 127.0.0.1:0 │
│ Rust shell   │───── HTTP + token ────▶│  share  listener 0.0.0.0:4317│
│  local Bun   │      (LAN)             │  SQLite + workspace files    │
└──────────────┘                        └──────────────────────────────┘
```

## What this is, and what it is not

**This is remote access, not sync.** One machine owns the SQLite database and the
asset files; other devices talk to that process over HTTP. There is exactly one
writer of record, so there is no merge, no conflict resolution, and no
replication lag — and no offline mode. A laptop away from the host has no
library. Offline access is a different and much larger feature; nothing here is
a step toward it.

The fact that makes this cheap: **assets already travel as HTTP bytes.**
`useReferenceAssets` fetches `/workspaces/{w}/references/{r}/assets/{variant}`
through the proxy and turns the response into a blob URL. Nothing in the render
path reads a local file, so browsing a library over the LAN needs no new asset
machinery.

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Environment** | A RefNest backend this device can talk to. Always at least one: `This device`. |
| **Device listener** | The loopback listener that exists today: `127.0.0.1:<ephemeral>`, per-launch token, full API. |
| **Share listener** | A second listener on the LAN, running only while sharing is on. Serves a strict subset of the API. |
| **Paired device** | A remote device that redeemed a pairing code and holds its own revocable token. |

In the UI these are **Libraries** (`This device`, `Studio PC`). "Environment" is
the code-level domain term only; it does not mean dev/staging/prod.

## The ordering problem this design exists to solve

Settings live in the sidecar's SQLite. But "which backend am I talking to?"
cannot be answered by the backend you have not chosen yet, and window bounds
must restore before any network call — the laptop has to draw its window whether
or not the host is awake.

**The local sidecar always spawns and is the device agent.** It owns
device-local state (desktop settings, the environment registry, sharing config,
paired devices) regardless of which environment is active. A remote environment
is an *additional* target, never a replacement for the local process.

## Architecture: two endpoints, one proxy

```
                        ┌─ api_request_local ──▶ device listener (always) ──▶ local SQLite
webview ── invoke ──▶ Rust
                        └─ api_request ────────▶ ACTIVE endpoint
                                                   ├─ local (default)
                                                   └─ remote host's share listener
```

The Rust shell gains one piece of mutable state, an `ActiveEndpoint` slot, and
one command:

```rust
activate_environment(id: Option<EnvironmentId>)
// None      → active = local
// Some(id)  → Rust calls the LOCAL sidecar GET /environments/{id}/connection
//             with the local token, receives { baseUrl, token }, caches it
```

The webview passes an **id**, never a URL and never a token. Credentials still
never enter the webview, which is the property the shell design exists to
protect.

**Rejected alternatives.** *Webview supplies base URL and token:* puts
credentials in the webview and defeats the point. *Rust owns a JSON registry
file:* moves domain state into Rust, creates a second persistence owner with its
own migration story, and contradicts "moving a feature means editing
TypeScript".

**Cost, stated plainly.** The README's "Rust does three things and nothing else"
becomes four: spawn, handshake, forward, and hold which endpoint "forward"
means. That is the smallest addition that keeps tokens out of the webview.

## The server: two listeners, two APIs

```
Bun process
├─ device listener  127.0.0.1:0     bearer = handshake token   serves RefNestApi (all)
└─ share listener   0.0.0.0:4317    bearer = per-device token  serves RefNestSharedApi
   (only while sharing is enabled)
```

### Scope is a property of the listener, not of the token

The share listener serves a **different, smaller `HttpApi`** rather than the
same API behind a deny-list. Host-only endpoints are then unreachable as a
build-time fact instead of a string table someone forgets to update.

This splits three existing groups in `packages/contracts/src/api.ts`:

| Today | Splits into | Shared? |
| --- | --- | --- |
| `workspacesGroup` | `workspacesGroup` (list) | yes |
| | `workspaceAdminGroup` (browse, create) | **no** — enumerates and creates host directories |
| `referencesGroup` | `referencesGroup` (list, byId, update, remove) | yes |
| | `referenceImportGroup` (importLocal) | **no** — takes a host absolute path |
| `aiGroup` | `aiEnrichGroup` (enrichReference) | yes — uses the host's key, the client never sees it |
| | `aiSettingsGroup` (get, update) | **no** |

Never shared, additionally: `settingsGroup`, `environmentsGroup`, and
`sharingGroup`. `POST /mcp` is mounted separately with only tools backed by
the shared groups; workspace creation and AI settings tools are absent.

`RefNestSharedApi` = health + notes + workspaces(list) + folders + references +
assets + smartFolders + quickSave + aiEnrich + pairing.

**Verified**, with one correction found in implementation. A spike ran both
listeners in one process and the shared one returned `404` for an endpoint
present only on the device API. But the isolation comes from the *separate
launch*, not from the API split: `HttpApiBuilder.Router` is a single tag and
layer memoisation is per build, so composing both APIs inside one graph makes
them register into the same router and the second `GET /workspaces` throws at
boot. `SharedContractApiLive` is therefore composed **inside** the listener
branch, where its own `Layer.launch` gives it its own router.

**Known cost.** `HttpApiBuilder.group(Api, name, …)` binds to one `HttpApi`
instance, so each shared group needs its wiring written twice, once per API. The
handler *logic* is a plain effect referenced by both. A group added to
`RefNestSharedApi` without its matching `group(...)` layer fails the build, so
this cannot rot silently into a 404.

### Share listener middleware

1. **Peer policy** — reject any remote address outside RFC1918, CGNAT,
   link-local, or loopback, before authentication. A share listener that answers
   a public peer is a bug, not a configuration.

   `isPrivateNetworkAddress` is an explicit allowlist, **not** the complement of
   the capture policy's public check. The complement looks equivalent and is
   not: capture also excludes documentation, benchmark, 6to4 and NAT64 ranges,
   none of which are local networks, so defining sharing against it accepted a
   peer from `203.0.113.0/24` as though it were on the LAN. Both policies now
   share one parser in `security/ip-address.ts` so they cannot drift, and
   `100.64.0.0/10` is allowed because mesh VPNs put devices there.
2. **Authentication** — bearer matched against `shared_devices.token_hash`,
   updating `last_seen_at`. `POST /pair` is the single exception.
3. **Rate limit** — per peer address, on authentication failure.

**Verified.** `HttpServerRequest.remoteAddress` is populated under
`BunHttpServer` (it delegates to `bunServer.requestIP`): `127.0.0.1` for
loopback and the real LAN address for a remote peer. No wrapping of Bun's fetch
handler is required.

### Starting and stopping the share listener at runtime

Toggling sharing must not restart the process; a restart drops the ephemeral
port and the running window's connection. The share listener is therefore owned
by an explicit `Scope`:

```ts
class ShareListener        // SynchronizedRef<Option<{ scope, port }>>
  start(port, hostname)    // Scope.make + Effect.forkIn(Layer.launch(branch), scope)
  stop()                   // Scope.close — awaitable
```

**Verified, including the approach that does not work.** Forking
`Layer.launch(...)` and interrupting the fiber leaves the port bound: later
probes hit a half-dead server returning `404`, and a restart appears to bind the
same port while the old socket is still open. Owning an explicit `Scope` and
closing it releases the port (a raw TCP connect is refused), leaves the device
listener untouched, and rebinds the same port cleanly.

The branch closes over an **already built** context, so starting the listener
never reopens the database. That context is narrowed with `Context.pick` to
exactly the tags `SharedApiServices` names. `Effect.context<A>()` returns the
whole fiber context and merely *types* it as `A`; at the point the listener is
built that includes the device listener's own `HttpServer`, and handing it over
let the branch's `serve` resolve the device server and `reload()` away its
handler — so enabling sharing silently made every loopback request answer 401.
Picking the tags makes the runtime match the type.

Three further consequences for the implementation:

- **Readiness must race** the ready `Deferred` against the launch fiber's exit.
  Awaiting the deferred alone hangs forever when the bind fails. A conflict
  surfaces as `Failed to start server. Is port 4317 in use?`, so the UI can name
  the problem instead of spinning.
- **`stop` is awaited** before the UI reports sharing off, or a fast off→on
  toggle races the unbind into a spurious `EADDRINUSE`.
- **A failed start leaves no phantom listener**: the scope is closed and the
  running port returns to `null`, so the next attempt is a clean bind.

### Middleware can reject, but cannot rewrite

`HttpApp.toHandled` sends the response *before* the middleware's continuation
resumes. A middleware may short-circuit before invoking the inner app — which is
exactly what `withBearerAuth` does today, so that pattern is safe — but

```ts
const response = yield* app
return HttpServerResponse.setHeader(response, "x-scope", scope) // silently dropped
```

does nothing. Response rewriting must go through
`HttpApp.appendPreResponseHandler`. Side effects such as touching `last_seen_at`
are fine inline.

## Pairing

```
HOST                                          CLIENT
Settings → Share → "Add a device"
  POST /sharing/invites (device listener)
  → code: 8 chars, expires in 5 min, single use
  → connect string: refnest://192.168.1.20:4317/<code>
                                              paste connect string, or host+port+code
                                              POST /pair (share listener, NO auth)
                                                { code, deviceName, platform }
  verify: invite outstanding, not expired,
  not consumed, constant-time compare,
  attempts under limit
  → mint a 32-byte token, store its sha-256
  → consume the invite
                                              ← { deviceId, token, libraryName, serverVersion }
                                              store environment + token locally
  Paired devices gains a row                    Libraries gains a row
```

`POST /pair` is the only unauthenticated endpoint in the system, and **it exists
only while an invite is outstanding**; otherwise it is absent. The attack window
is the few minutes you are actively pairing, not the whole time sharing is on.
That property is what makes the plain-HTTP decision defensible.

Tokens are stored hashed on the host. SHA-256 is sufficient — they are 32 bytes
of CSPRNG output, not passwords — with a short prefix kept for display.
Revocation is a row update; the next request gets `401`.

## Storage

Four new tables in the existing app-local SQLite:

```
sharing_settings   (id = 1, enabled, port, bind_address)
pairing_invites    (code_hash, created_at, expires_at, consumed_at, attempts)
shared_devices     (id, name, platform, token_hash, token_prefix,
                    created_at, last_seen_at, revoked_at)
environments       (id, name, host, port, device_token, created_at, last_connected_at)
```

`environments.device_token` is the token *this* device was granted by a host. It
is plaintext at rest and inherits the same limitation `DESIGN.md` already
records for the AI provider key: the file's operating-system permissions and
nothing more, until a cross-platform credential store is introduced.

## Cross-device semantics

**Works over the LAN with no new machinery:** browsing, search, filters,
folders, smart folders, asset and preview streaming, metadata edits, trash and
restore.

**Works, and is arguably better remote:** Quick Save — the client posts a URL and
the host's Chromium and `yt-dlp` do the work, with the job already persisted and
pollable. AI enrichment likewise runs against the host's key.

**Host-only, hidden in remote UI:** workspace creation, the folder explorer,
local file import, and AI provider settings. Remote MCP follows that same
reduced surface.

**Device-local always, routed to the local sidecar even when a remote is
active:** `GET`/`PATCH /settings`. Window bounds, sidebar width, theme, and the
active section belong to the device in front of you and must resolve before the
network is known.

Two contract changes follow from that:

- `DesktopSettings` gains `activeEnvironmentId`.
- `selectedWorkspaceId` becomes per-environment. A workspace id is only
  meaningful relative to one library, so a single field would make the laptop
  resume into a workspace that exists on the host and nowhere else. This is a
  schema change to a persisted document and needs a migration for existing rows.

`Workspace.path` is a host absolute path. On a remote it is informational only
and must never be treated as reachable by the client.

**Concurrent edits:** last write wins against a single SQLite owner. No conflict
machinery is needed, and none should be built.

## Failure modes

| Situation | Behaviour |
| --- | --- |
| Host asleep or off | Named error and a retry, plus one click back to `This device`. Never an endless spinner. |
| Host address changed | The address is **editable without re-pairing** — the token is host-issued, not address-bound. This is what makes manual addressing survivable. |
| Token revoked on the host | `401` marks the environment "needs pairing again". No silent retry loop. |
| Version skew between builds | `GET /health` reports the version; say "the host is 0.2.0, this device is 0.1.0" rather than surfacing a schema decode error. |
| Port already in use | Named from the bind failure: "port 4317 is already in use". |
| Firewall blocks the port | Windows prompts on first bind. After enabling, the addresses are shown so the user can test one. |
| Request hangs | The Rust proxy sets an explicit timeout. It had none, which was harmless on loopback and is not over a network. |

## Security posture

The LAN listener speaks plain HTTP. Anyone able to observe the network can read
a device token and the reference bytes, and a token grants full library read and
write.

What limits it: nothing binds until sharing is enabled; the listener refuses
non-private peers; the unauthenticated pairing endpoint exists only during a
short, code-gated window; tokens are per-device, hashed at rest, and revocable
individually. This is appropriate for a home or studio network and not for guest
or public wireless, and the UI says so at the toggle.

If that trade stops being acceptable, TLS with a fingerprint pinned at pairing
fits the same pairing payload — but retrofitting it changes that payload, so it
is worth deciding once rather than drifting into.

## Interface surface

A **Network** section on the existing Settings page, plus a shell indicator.

**This device** — a toggle to share on the local network, with a plain statement
that traffic is unencrypted; the port and the list of reachable addresses; "Add
a device", showing a code, a QR, and a connect string with an expiry countdown;
and the paired devices with name, platform, last seen, and revoke.

**Libraries** — a `This device` row, always present and always selectable; saved
remotes with status, connect, edit address, and forget; and an entry point that
accepts a connect string or a host, port, and code.

**Shell** — when a remote is active, the title bar carries the environment name
beside the workspace breadcrumb. `DESIGN.md` asks the interface to be "honest
about local state", and which machine's library is being edited is the most
consequential state in the app. Per the same document, the indicator is a word
and a glyph, never colour alone.

## Phasing

1. **Plumbing** — the two-endpoint proxy, the environment registry, device-local
   settings routing. Nothing is shared yet; the app behaves as it does today
   plus a one-row Libraries list.
2. **Share listener** — `RefNestSharedApi`, peer policy, runtime start and stop.
3. **Pairing** — invites, device tokens, revocation, the paired-devices surface.
4. **Connect flow** — add, edit, forget, the shell indicator, failure states.
5. **Later** — multipart upload so remote import works, mDNS discovery, TLS
   pinning.

## Verification

`bun run test` covers the endpoint surface (host-only paths answer 404 over the
LAN), the token rules, the pairing lifecycle — expiry window, single use,
attempt limit, revocation — the listener's start/stop/rebind and its
port-conflict message, the saved-library registry, and the address boundary
itself.

`bun run smoke` runs the whole chain against the compiled binary: it enables
sharing, checks the device listener still answers, issues a code, redeems it
over the LAN listener, browses the library with the issued token, and confirms
`/settings` is unreachable there. That last pair is a regression guard — both
the router collision and the leaked `HttpServer` were caught only with two real
listeners in one process, which no unit test reproduced.

Still unproven: concurrent writes arriving on both listeners at once. There is a
single SQLite owner and a single service graph, so the design says last write
wins, but nothing exercises it yet.
