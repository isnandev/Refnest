# Design — Tauri Effect Starter

This project inherits the global design source (Quiet Industrial Software). Only
the decisions specific to this desktop shell are recorded here; for token values,
roles, and rules, the global source is authoritative.

Implementation lives in `apps/desktop/src/index.css`, which declares the tokens
and points shadcn/ui's semantic slots at them.

## Direction

Industrial and raw. This is a developer starter, so the interface should read as
a working instrument: dense, achromatic, honest about what the machine is doing.
Nothing decorative earns its place.

## Project decisions

- **`data-theme` on `<html>`** is the resolved theme, matching the global source's
  documented selector. `.dark` is accepted as an alias so unmodified shadcn/ui
  `dark:` utilities keep working. The topbar toggle and Settings view support
  system, light, and dark preferences and persist the choice through the Bun
  sidecar to SQLite.
- **The main scroller uses a minimalist custom scrollbar.** A transparent `8px`
  hit track carries a `4px` visible rounded thumb that gains contrast on hover
  and active states. It is semantic-token driven in both themes and scoped only
  to `#main-content`.
- **Initial app preferences are local and visible.** Theme, compact-window sidebar
  collapse, reduced motion, and sidebar background opacity are the first settings.
  They take effect immediately, persist on device, and can be restored to documented
  defaults. Sidebar opacity is deliberately bounded from `40%` to `80%` so the native
  backdrop remains visible without sacrificing navigation legibility.
- **Desktop state resumes from Bun SQLite.** Theme, sidebar width/collapse state,
  selected workspace, active page, and the native window's normal bounds/maximized
  state share one typed settings document. The frameless window starts hidden, applies
  reachable saved bounds, and then reveals itself. Bounds left on a disconnected
  monitor are ignored in favor of Tauri's centered default.
- **Workspace navigation is a shell-level control.** The former product title is a
  searchable workspace selector. Workspace listing, directory browsing, and folder
  creation come from the authenticated Bun/Effect sidecar contract; the desktop app
  does not invoke a Tauri-native file dialog.
- **Workspace creation is modal and contextual.** The modal pairs one named input with
  a bounded folder explorer, Home/parent navigation, explicit loading and failure
  states, and a clear statement that a new folder will be created in the chosen
  location.
- **Global actions use cmdk.** The sidebar's former quick-note control and
  `Ctrl/Cmd+K` open one command palette for creation, navigation, settings, and
  workspace switching.
- **Fonts fall back to the system stack.** Inter and JetBrains Mono are named
  first, but no font files are bundled and the app's CSP (`default-src 'self'`)
  blocks remote font loading. Add the files under `apps/desktop/public` and an
  `@font-face` block if exact type matters more than install size.
- **The dark panel shows the sidecar's `GET /health` response.** The global
  source reserves recessed matte surfaces for machine output; a live payload that
  crossed webview → Rust → Bun is exactly that, and it doubles as the starter's
  proof that the chain works.
- **The empty state uses the two-tone `display` treatment.** The global source
  permits it in empty states and forbids it in app chrome.
- **Token-backed component variants, not page overrides.** shadcn/ui primitives in
  `src/components/ui` were edited in place to carry the documented pill radius,
  34px control height, 2px focus ring at 2px offset, and the badge state
  variants. Pages set layout only.
- **The workspace uses a split surface.** The full-height navigation sidebar uses a
  configurable translucent stage tint over the frameless desktop window, while the
  working canvas stays opaque white (raised surface in dark mode) behind a centered
  vertical document. Surface-backed controls preserve legibility, and a hairline
  divider—not a floating frame—separates the two regions.
- **The titlebar is a borderless breadcrumb bar.** It reports the active hash section
  (`Notes`, `Create note`, `Runtime`, `Output`, or `Settings`) while keeping the whole
  non-interactive label region draggable.

## Screens

Two hash-addressable views. A `272px` full-height sidebar carries the workspace selector,
command-menu trigger, and anchored navigation. It can be resized from `232px` to `360px`,
collapses to a `56px` icon rail, and defaults to the rail below `900px`.

The main surface has a fixed, borderless `52px` desktop titlebar outside the content scroll
viewport, so the scrollbar begins below the app navigation instead of running
behind it. Its content is a centered, single-column document capped at `900px`:
status header, stack summary, runtime details, note composer, saved notes, and raw
sidecar output. The breadcrumb lives in the titlebar instead of the scrolling document.
This preserves the reference's spacious vertical rhythm without reproducing its
presentation frame or example product data.

The Settings view reuses that same document measure and outside-heading/card
rhythm. Appearance and app-behavior rows use working controls; the Settings link
sits at the bottom of the navigation so the primary Notes workflow stays first.

## Verification

- Status is never colour alone — each badge variant states its word and carries a
  glyph.
- Every interactive element takes the ring on `:focus-visible`.
- Timestamps use `.numeric` (tabular figures).
- `prefers-reduced-motion` reduces every transition to ~0ms.
