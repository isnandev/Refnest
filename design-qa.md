# Design QA

## Evidence

- Source visual truth: user-provided `240 × 335` scrollbar/window-edge attachment in
  the current conversation, plus the follow-up requirement that scrolling must be
  confined below the navigation/titlebar. The reference attachment is not exposed as
  a local filesystem path.
- Initial implementation screenshot: `.qa/implementation-settings-light-final.png`.
- Final implementation screenshot:
  `.qa/implementation-settings-light-minimal-scroll.png`.
- Additional theme evidence: `.qa/implementation-settings-dark-final.png`.
- Window and density: Tauri app viewport `1040 × 720` CSS px at device scale factor
  `1`; captured bitmap `1056 × 729` px includes the native/DWM window edge around the
  app-owned viewport. The source is a partial crop with unknown density, so comparison
  is limited to the scrollbar geometry, containment, palette, and rounded treatment.
- State: Settings view, expanded sidebar, light theme for the final minimalist check;
  dark theme inspected separately for token inversion.

## Full-view comparison

The final app capture preserves the fixed `52px` titlebar and full-height sidebar while
placing the scroll viewport only around the document below the titlebar. The main
content remains centered and no persistent app control is obscured or pushed outside
the window.

## Focused region comparison

The reference's relevant region is the window's right edge. In the final capture, the
titlebar row at `y=27` is a continuous surface through `x=1028–1047` with no scrollbar.
The titlebar divider is at `y=52`; the rounded thumb begins below it and remains
confined to the content viewport. Pixel inspection finds a `4px` visible thumb at
`x=1042–1045`, surrounded by canvas-colored pixels on its transparent `8px` hit
track. Native arrow buttons are absent. The thumb stays quiet at rest and gains
contrast on hover and active states in both themes.

## Required fidelity surfaces

- Fonts and typography: unchanged from the project's system/Inter stack; the layout
  correction introduces no wrapping, weight, hierarchy, or antialiasing regression.
- Spacing and layout rhythm: the `52px` titlebar is now a sibling of the scroller, not
  a sticky child inside it. Content width, padding, card rhythm, and sidebar dimensions
  remain unchanged.
- Colors and visual tokens: scrollbar track, thumb, hover, and active colors remain
  semantic-token driven in both themes.
- Image quality and asset fidelity: the reference contains no app-owned raster asset.
  Its wallpaper and outer presentation context are intentionally excluded from the
  product UI.
- Copy and content: no application copy changed in this correction.

## Findings

No actionable P0, P1, or P2 differences remain for the requested minimalist
scrollbar or its containment.

## Comparison history

1. Initial pass — `blocked`: the scrollbar occupied the entire right pane and ran
   beside/behind the titlebar because `TitleBar` was inside `#main-content`.
   - Severity: P2.
   - Fix: added a dedicated shell header slot and made the titlebar and scrollable
     `<main>` sibling regions in a `min-height: 0` flex column.
2. Final pass — `passed`: `.qa/implementation-settings-light-nav-separated.png`
   shows the scrollbar beginning below the titlebar divider, with the sidebar and all
   window controls stationary.
3. Minimalist refinement — `passed`:
   `.qa/implementation-settings-light-minimal-scroll.png` shows a transparent rail,
   `4px` visible rounded thumb, and no native arrow buttons. The styling is scoped to
   `#main-content` rather than registered globally.

## Primary interactions checked

- Settings navigation opens the hash-addressable Settings view.
- Theme choices update the page and scrollbar palette.
- The content region scrolls independently while the titlebar and sidebar remain fixed.

## Implementation checklist

- [x] Keep the titlebar outside the scrolling element.
- [x] Confine vertical overflow and scrollbar gutter to `#main-content`.
- [x] Keep the scrollbar rail transparent and remove native arrow controls.
- [x] Preserve fixed sidebar, titlebar controls, theming, and responsive behavior.

## Follow-up polish

No P3 follow-up is required for this correction.

## Workspace flow evidence

- `.qa/workspace-shell.png` — global cmdk menu open in the live Tauri window with
  creation, navigation, settings, and workspace-switching groups.
- `.qa/workspace-selector-screen.png` — transparent sidebar and the workspace selector
  popover, captured from the composed desktop window so the portal and OS backdrop are
  both visible.
- `.qa/workspace-create-modal-final.png` — modal creation flow with a live home-directory
  listing returned by the Bun sidecar and a compact, arrow-free internal scrollbar.
- The selector preserves the current workspace with both a check glyph and the name;
  lime is used only as the current-selection mark.
- Keyboard behavior checked: `Ctrl+K` opens cmdk, text filters to “Create workspace…”,
  and Enter opens the modal with focus in the independently labelled name input.
- Backend boundary checked: the desktop workspace feature imports only the generated
  API client. No Tauri dialog plugin or native folder picker is present.

## Shell navigation and sidebar surface evidence

- `.qa/sidebar-opacity-60-screen.png` — final live Tauri Settings view at the `60%`
  default, showing the borderless titlebar breadcrumb, translucent sidebar surface,
  matching Settings selection, and the bounded opacity control.
- `.qa/sidebar-opacity-40-screen.png` — lower-bound check at `40%`; the desktop
  backdrop is visibly stronger while labels and surface-backed controls remain legible.
- `.qa/sidebar-settings-opacity.png` — upper-bound check at `80%`; the sidebar tint is
  more solid without becoming fully opaque.
- `.qa/sidebar-runtime-active-screen.png` — hash navigation to `#runtime` moves the
  document to Runtime details, changes the titlebar breadcrumb to `Workspace / Runtime`,
  and gives only the Runtime sidebar link `aria-current="page"` and the active surface.
- Computed-style inspection confirmed `0px` bottom border on the titlebar, `overflow-y:
  scroll` only on `#main-content`, hidden body overflow, and sidebar alpha values of
  `0.4`, `0.6`, and `0.8` at the corresponding slider values.
- Automated hash checks covered `#overview`, `#new-note`, `#runtime`, `#output`, and
  `#settings`; in every case the breadcrumb label and sole active navigation href
  matched the requested destination.

final result: passed
