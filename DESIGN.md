# Design — RefNest

This project inherits the global design source (Quiet Industrial Software). Only
the decisions specific to the RefNest desktop shell are recorded here; for token
values, roles, and rules, the global source is authoritative.

Implementation lives in `apps/desktop/src/index.css`, which declares the tokens
and points shadcn/ui's semantic slots at them.

## Direction

Industrial and raw. RefNest is a visual reference vault, so the interface should
read as a focused curatorial instrument: dense, achromatic, honest about local
state, and subordinate to the saved imagery. Nothing decorative earns its place.

## Saved visual reference

The user-provided **Eaglepack Preview / Web Inspiration Picks** screenshots are
the visual reference for the reference-vault experience. They establish the
following product-level direction:

- **Image-first masonry workspace.** Saved references are the dominant content;
  portrait-heavy thumbnails sit in a dense, even-gutter grid with minimal chrome
  competing for attention.
- **Three-region desktop shell.** Use a compact navigation rail/sidebar on the
  left, a central collection canvas, and a right inspector for the selected
  collection or item. The inspector exposes title, description, metadata, and a
  clear export action.
- **Quiet archive controls.** Keep search, breadcrumbs, navigation, filters, and
  counts compact and line-based. Hairline dividers, restrained radii, and small
  gaps should make the library feel collected rather than dashboard-like.
- **Theme parity.** Support the same information architecture in light and dark
  modes. Light mode uses a soft neutral stage and dark text; dark mode uses a
  charcoal stage with near-black image surfaces and muted light text.
- **Selection is contextual.** The active folder, collection, or item should be
  unmistakable through a quiet surface shift or border/accent treatment, while
  the imagery remains the visual priority.
- **Reference frame boundary.** The screenshots include an operating-system
  window frame and a third-party reference manager shell. They are inspiration
  for RefNest's in-app layout only; do not reproduce the surrounding macOS
  presentation frame as product UI.

## Project decisions

- **`data-theme` on `<html>`** is the resolved theme, matching the global source's
  documented selector. `.dark` is accepted as an alias so unmodified shadcn/ui
  `dark:` utilities keep working. The Settings page owns the system/light/dark
  preference and persists it through the Bun sidecar to SQLite; the command
  palette keeps a one-key light/dark flip for the moments the page is too far.
- **The main scroller uses a minimalist custom scrollbar.** A transparent `8px`
  hit track carries a `4px` visible rounded thumb that gains contrast on hover
  and active states. It is semantic-token driven in both themes and scoped only
  to `#main-content`.
- **Settings is one page, not scattered chrome.** Theme, reduced motion, and the AI
  provider live on a single full-screen Settings view with a `Library` return control
  in the titlebar. It is reached from the button pinned to the sidebar footer or from
  the command palette; no preference keeps a shortcut in the titlebar, so the toolbar
  stays about the references.
- **App preferences are local and visible.** Appearance settings take effect
  immediately, persist on device, and can be restored to documented defaults. Only
  settings that change this shell are shown — a preference with nothing to act on is
  not listed, which is why sidebar opacity and compact-window collapse are absent.
- **A capture reports itself, twice.** Captures run in the sidecar, so the app shows
  where each one is: a toast stack in the bottom-right carries live progress and then
  the outcome, and the same stage label and bar appear in the capture-activity list
  behind the sidebar bell. The sidecar reports stages rather than percentages, so each
  stage owns a fixed bar width instead of a fabricated crawl. A finished capture keeps
  its notification until it is dismissed if it failed or lost its metadata, and clears
  itself after six seconds if it did not. Captures already finished when the app opens
  stay silent — a result nobody waited for is history, not news.
- **AI provider credentials are locally redacted but not keychain-backed.** The
  provider form is the one section of Settings that saves on submit rather than on
  change, so a half-typed URL or key never reaches the sidecar. API responses expose
  only whether a key exists, and provider-origin changes clear an
  unreplaced key. The key is currently stored as plaintext in the app-local SQLite
  database and therefore inherits only that file's operating-system permissions;
  this is a known at-rest limitation until a small, cross-platform credential-store
  integration is introduced.
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
- **Search is the command palette.** cmdk replaces both the toolbar's search field
  and the sidebar's folder filter: the toolbar control is now a trigger that reports
  the active query and clears it, `Ctrl/Cmd+K` opens the same surface anywhere, and
  typing drives the library query so the grid behind the palette narrows to the
  results the palette lists. One palette carries references, folders, creation,
  settings, and workspace switching, so there is a single place to look for anything.
- **A click opens the picture, not a form.** Selecting a reference in the grid
  raises a full-viewport viewer on a near-black canvas — the `canvas` variant of
  the shared dialog, so the treatment stays token-backed — with the arrows
  walking the order the grid is showing. The inspector is no longer a
  consequence of clicking: it starts collapsed and opens only from the titlebar
  control or the viewer's `Details` button. A vault is for looking at imagery,
  and the metadata is a question the user asks rather than one the app answers
  unprompted.
- **Selection is a gesture; the bulk bar is its only new chrome.** Press and hold
  a reference to start a selection, then click to add and remove, `Shift`-click
  for a run, and `Ctrl/Cmd`-click without leaving the gesture. Because a hold has
  no keyboard equivalent, every card also carries a tick box that appears on
  hover or focus. Selected cards take the documented lime ring; the actions
  appear in a floating pill bar pinned bottom-centre, over the grid rather than
  in place of the toolbar, so the references stay where the user left them.
  `Esc` clears, `Ctrl/Cmd+A` takes everything the current view lists, and a
  double-click still opens one reference without spending the selection.
- **Metadata is edited where it is read.** Title, description, and tags in the
  inspector become their own field on double-click — the rename gesture from the
  file manager next to this app — and a keyboard activation opens the same
  editor, since a keyboard cannot double-click. `Enter` saves, `Esc` cancels,
  and the field states the rule it broke beneath itself instead of turning red.
  Only the three fields the reference contract accepts are editable; dimensions,
  size, type, and origin are facts, so they stay read-only.
- **Zoom counts columns, not pixels.** The control runs from eight columns down
  to one and reads out the count, and the masonry now honours each reference's
  real proportions instead of flattening them toward a square. The layout toggle
  is gone with it: masonry was the only view, so a permanently pressed button
  said nothing.
- **Fonts fall back to the system stack.** Inter and JetBrains Mono are named
  first, but no font files are bundled and the app's CSP (`default-src 'self'`)
  blocks remote font loading. Add the files under `apps/desktop/public` and an
  `@font-face` block if exact type matters more than install size.
- **The dark panel shows the sidecar's `GET /health` response.** The global
  source reserves recessed matte surfaces for machine output; a live payload that
  crossed webview → Rust → Bun is exactly that, and it provides an explicit
  integration diagnostic while the vault features are developed.
- **The empty state uses the two-tone `display` treatment.** The global source
  permits it in empty states and forbids it in app chrome.
- **Token-backed component variants, not page overrides.** shadcn/ui primitives in
  `src/components/ui` were edited in place to carry the documented pill radius,
  34px control height, 2px focus ring at 2px offset, and the badge state
  variants. Pages set layout only.
- **The workspace uses a split surface, and both halves are opaque.** The full-height
  navigation sidebar is the raised surface; the working canvas is the grey stage. A
  hairline divider—not a floating frame—separates the two regions. The window is
  frameless and the Windows shell still applies an acrylic backdrop, but the interface
  paints over it: a translucent sidebar was tried and removed because the vault reads
  better against a settled surface than against a moving desktop.
- **The titlebar is chromeless.** No background of its own and no divider under it, so
  the workspace/folder breadcrumb, the palette trigger, and the window controls appear
  to float on the canvas. The whole non-interactive label region stays draggable. It
  carries no back/forward affordance — history does not exist yet, and a permanently
  disabled control is worse than none.

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
