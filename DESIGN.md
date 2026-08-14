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
  `dark:` utilities keep working. The Settings modal owns the system/light/dark
  preference and persists it through the Bun sidecar to SQLite; the command
  palette keeps a one-key light/dark flip for the moments the modal is closed.
- **The main scroller uses a minimalist custom scrollbar.** A transparent `8px`
  hit track carries a `4px` visible rounded thumb that gains contrast on hover
  and active states. It is semantic-token driven in both themes and scoped only
  to `#main-content`.
- **Settings is one modal, not a page.** Theme, reduced motion, libraries, imports,
  MCP, and the AI provider live in a single dialog with a left section list and a
  main pane. The library stays mounted underneath. It is reached from the sidebar
  footer or the command palette; no preference keeps a shortcut in the titlebar.
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
- **MCP credentials are revealed only on request.** The loopback MCP endpoint is
  always authenticated and available while RefNest is open, but its URL and
  bearer token stay inside the Rust shell until the user opens MCP access in
  Settings. The token is masked by default, copy feedback is explicit, and the
  page warns that the session credential grants control of the local library
  and rotates on restart.
- **MCP writes rejoin the visible library silently.** A mutation made through
  MCP bypasses React's local mutation callbacks, so the open library refreshes
  folders, smart folders, and references every 1.5 seconds while the document
  is visible and once when it regains focus. These background reads keep the
  last good snapshot instead of flashing loading or failure states, and
  overlapping LAN requests are coalesced rather than queued.
- **AI enrichment must inspect an image before it may describe one.** The
  sidecar verifies and bounds the stored preview or asset, attaches it inline,
  and derives the dominant colour swatches from the decoded pixels so provider
  quirks cannot make colours randomly disappear. An image that cannot be
  prepared, or a vision model that replies that it cannot see the attachment,
  fails enrichment without replacing good metadata with an apology. Omitted
  collections preserve the reference's existing tags and colours.
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
- **A click opens the media, not a form.** Selecting a reference in the grid
  replaces the grid inside the library canvas with a near-black viewer rather
  than raising a modal over the app. The grid stays mounted underneath so its
  scroll position and loaded thumbnails survive the short spatial transition,
  and arrows walk the order the grid is showing. Videos use the original asset
  in a native player, start muted so autoplay is reliable, and retain controls
  for pause and unmute. The inspector is no longer a consequence of clicking:
  it starts collapsed and is left alone while the viewer is open — no Details
  control in the viewer, and no collapse control on the inspector. A vault is
  for looking at imagery, and the metadata is a question the user asks rather
  than one the app answers unprompted. Zoomed images can be dragged to pan.
- **Selection is a gesture; the bulk bar is its only new chrome.** Press and hold
  a reference to start a selection, then click to add and remove, `Shift`-click
  for a run, and `Ctrl/Cmd`-click without leaving the gesture. Because a hold has
  no keyboard equivalent, every card also carries a tick box that appears on
  hover or focus. Selected cards take the documented lime ring; the actions
  appear in a floating pill bar pinned bottom-centre, over the grid rather than
  in place of the toolbar, so the references stay where the user left them.
  `Esc` clears, `Ctrl/Cmd+A` takes everything the current view lists, and a
  double-click still opens one reference without spending the selection.
- **A drop is an import, and it says where it lands.** Files dragged onto the
  window import into the folder currently being viewed — the same destination
  the sidebar's `Import files…` uses, so the two entrances cannot disagree. The
  drop is handled natively by the webview, so the overlay never takes the
  pointer; it only states the count, the destination, and what is being skipped.
  A drop that carries nothing importable, or that lands on a library hosted by
  another machine, says so instead of failing quietly, and the run reports
  itself in a pill beside the bulk bar because an import of twenty files is
  otherwise invisible from the grid.
- **Paste adds whatever the clipboard is holding.** `Ctrl/Cmd+V` anywhere in the
  library reads the clipboard: content becomes an import, a link becomes a
  capture, and both land in the folder being viewed — the same destination a
  drop or the menu's own action uses. Content wins when both are present,
  because a file copied out of the file manager also carries its path as text
  and the bytes are the better answer of the two. The capture toast and the
  import pill are the confirmation, so the dialog is for links that need the AI
  toggle changed rather than for every link. Only a whole `http(s)` URL counts
  as a link: a paste of prose, a file path, or anything inside a field belongs
  to the surface it landed in and does nothing here. A repeat of the same link
  within two seconds is read as the habit of checking whether the first one
  took, not as a request for a second copy.
- **Pasted content travels as bytes; dropped files never do.** The clipboard
  holds content rather than a path, so paste is the one import that puts the
  file on the wire — capped well below what the desktop's IPC hop should carry,
  with anything larger sent back to drag-and-drop, which the sidecar reads from
  disk. The sidecar trusts none of it: the header decides the type, the
  extension, and whether the library keeps it, exactly as it does for a picked
  file. Both doors run the same containment, verification, and cleanup, because
  a second copy of that code is a second place for it to be wrong.
- **A bulk action either needs an argument or it does not.** Favourite, trash,
  restore, select-all, and clear act on the click; move, tag, and rate open a
  small panel above the bar to take the one thing they need. Tagging adds to
  what each reference already carries rather than replacing it, and lists the
  tags in play with the share of the selection holding each, since removing a
  tag from three of twelve is a different act from removing it from all twelve.
  A trashed reference is read-only in the inspector, so a selection holding one
  disables the three editors rather than half-applying them.
- **Metadata is edited where it is read.** Title, notes, link, and tags in the
  inspector become their own field on double-click — the rename gesture from the
  file manager next to this app — and a keyboard activation opens the same
  editor, since a keyboard cannot double-click. `Enter` saves, `Esc` cancels,
  and the field states the rule it broke beneath itself instead of turning red.
  They rest in a bordered box so the panel reads as a form without behaving like
  one; dimensions, size, type, and the dates stay read-only, because they are
  facts about the file rather than opinions about it.
- **Zoom counts columns, not pixels.** The control runs from eight columns down
  to one and reads out the count, and every layout honours each reference's real
  proportions instead of flattening them toward a square. Under justified the
  same number sets the row height, so one control means the same thing in all
  three layouts.
- **How the grid reads lives in one popover; what it shows lives in another.**
  Layout, thumbnail quality, sort, columns, and the caption toggles sit together
  under the view control, and filtering keeps its own funnel next door.
  Mixing them would put "which references am I looking at" and "how big are
  they" in the same menu. Sort still happens in the sidecar over the whole
  result; the funnel then narrows that already-sorted page client-side so a
  large library is not re-fetched for every chip. Tags can be included or
  excluded, types and ratings and dates and folders combine, and presence
  flags cover notes, a stored palette, and a thumbnail. Match All / Any joins
  those clauses; excludes always subtract. The current document and named
  presets live in local storage per workspace so a restart opens the same
  funnel without growing the shared settings contract. The toolbar badge
  counts active groups, and an empty grid offers a one-click clear.
- **Three layouts, each earning its place.** Masonry keeps the columns even and
  lets height run; justified fills each row to both edges at one height, the way
  a contact sheet reads; grid crops to a square when the collection matters more
  than any single image. A layout that only ever had one option is a label, not
  a control — which is why this dropdown arrived with the other two.
- **Thumbnail quality names what it costs.** `Speed` renders the stored preview,
  which the library already built; `Quality` renders the original for images,
  which is sharper on a large tile and heavier to load. A video or PDF has no
  original a browser would draw, so it keeps its preview under both.
- **A video makes its poster once.** When a captured or imported video has
  no source-provided image, the sidecar asks the bundled FFmpeg executable for
  one representative frame, bounds it to the same 1536px preview edge, and
  stores the JPEG beside other previews. Grid cards keep loading an image rather
  than downloading whole videos. Extraction failure leaves the video usable and
  does not turn a codec limitation into a failed import. One background pass at
  startup applies the same rule to older video rows without delaying the API.
- **A rating is a mark, and zero is unrated.** Five stars, filled in lime as a
  mark rather than a fill that carries text, and clicking the star a reference
  already holds clears it — otherwise a rating could be raised but never taken
  back. Shape carries the state as well as colour: filled against outlined.
- **Three dates, because they are three different facts.** `Date Imported` is
  when this library first saw the reference. `Date Created` and `Date Modified`
  are the source file's own, read from disk at import and stored beside the
  library's. A web capture never was a file, so both read `Unknown` rather than
  borrowing the import time and pretending.
- **Export copies; it never moves.** The sidecar writes the copy because it is
  the process that can read the library's files, and the dialog only supplies
  the path. The endpoint is host-only for the same reason local import is: a
  destination path means nothing to a paired device.
- **Sorting happens in the sidecar, over the whole result.** The list endpoint
  takes a field and a direction and returns them applied, so paging, search, and
  smart folders all agree on the order. Ties fall back to import order and then
  to the id, so an unchanged library never reshuffles under the user.
- **The close button wears `danger` permanently.** Minimise and maximise stay
  quiet and fill only on hover; closing is the one control that ends the session,
  so it carries the documented danger token at rest instead of waiting for a
  pointer to explain itself. The three sit as rounded controls on the canvas
  rather than as a system-style strip, matching the rest of the chrome.
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
collapses to a `56px` icon rail, and defaults to the rail below `900px`. The right inspector
uses the same persisted `232px`–`360px` resize behavior from its inside divider, defaults to
`288px`, and becomes a width-capped overlay below `900px`.

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
