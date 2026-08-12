# Design QA — Reference Library

## Evidence

- Source visual truth: `.qa/reference-library-source-1280x1000.webp` (the selected
  Eaglepack / Web Inspiration Picks reference supplied for this layout).
- Final implementation screenshot:
  `.qa/reference-library-resizable-final-1280x1000.png`.
- Filter popup screenshot:
  `.qa/reference-library-filter-popup-native.png`.
- Filter dismissal screenshot:
  `.qa/reference-library-filter-popup-outside-dismissed-native.png`.
- Same-input full comparison:
  `.qa/reference-library-resizable-comparison-1280x1000.jpg`.
- Focused chrome comparison:
  `.qa/reference-library-resizable-focused-comparison.jpg`.
- Source pixels: `1280 × 1000`.
- Implementation pixels: `1280 × 1000`, captured from the live frameless Tauri
  window with `PrintWindow`; Windows DPI was `96` (`deviceScaleFactor: 1`). The
  thin transparent native resize edge is retained in the capture and is not app UI.
- Browser interaction viewport: `1280 × 800` CSS px at `devicePixelRatio: 1`.
- Density normalization: no resampling in the full comparison; both source and
  implementation are compared at equal pixel dimensions.
- State: dark theme, `Web inspiration` collection selected, folder tree expanded,
  no thumbnail selected, right inspector open, and twenty real source thumbnails
  visible. The focused popup evidence shows the navbar-anchored filter panel open.

## Full-view comparison

The implementation preserves the reference's three-region composition: a dense
folder/navigation sidebar, an image-first masonry canvas, and a persistent metadata
inspector. The compact top chrome retains back/forward, breadcrumb, zoom, view,
filter, search, notification, add, and inspector controls. Region proportions,
hairline separation, small-control density, and portrait-heavy thumbnail rhythm read
as the same product class at the matched `1280 × 1000` capture.

The source uses a warmer mid-charcoal shell while RefNest uses the repository's
documented dark tokens (`stage` / `surface`). This is an intentional product-system
mapping, not an unresolved fidelity issue. The source's macOS traffic lights and outer
third-party presentation frame are intentionally not reproduced.

## Focused region comparison

The focused comparison verifies the small chrome that is difficult to judge in the
full view: notification and add controls, folder rows and tabular counts, breadcrumb,
zoom and filter controls, thumbnail gutters and radii, inspector hierarchy, and the
export action. Icons use the project's existing Lucide family consistently, are
optically aligned at the documented compact size, and all icon-only controls have
accessible names.

The left divider is intentionally visually quiet at rest. Its hit target extends
`8px` to each side of the one-pixel rule, gains semantic focus/active color, and tracks
the pointer without an animated width tween.

The filter control now follows the requested overlay behavior: its panel is anchored
to the navbar icon, remains inside the viewport, and overlays the canvas without
moving the masonry grid. It uses the same surface, border, type, and lime-selection
tokens as the surrounding chrome.

## Required fidelity surfaces

- Fonts and typography: the implementation uses the documented Inter/system stack,
  compressed label/body scale, muted metadata, medium active labels, tabular folder
  counts, and truncation where the reference is dense. No cramped or broken wrapping
  is visible in the matched capture.
- Spacing and layout rhythm: the `52px` topbar, `272px` default left sidebar,
  `288px` inspector, `12px` masonry gutters, compact rows, and hairline separators
  preserve the reference hierarchy. The left sidebar can resize from `232px` to
  `360px`, so users can match the source's wider rail or reclaim canvas space.
- Colors and visual tokens: all chrome uses semantic stage, surface, text, border,
  focus, danger, and lime-selection tokens. Literal colors in `library-data.ts` are
  content-derived palette swatches, not interface styling.
- Image quality and asset fidelity: all visible cards use real web-reference raster
  assets from the selected source family. Images remain sharp, use top-aligned cover
  crops, preserve their intended subject matter, and have no placeholder, CSS-art,
  custom-SVG, or emoji substitutions.
- Copy and content: RefNest-specific labels are coherent and self-contained;
  collection metadata, notification text, menu actions, filters, item titles, dates,
  sizes, and inspector copy use realistic frontend-only mock data.
- Accessibility: the resize divider is a focusable vertical separator with min, max,
  current value, and keyboard arrow controls. Icon buttons are labelled, active and
  selected states are not color-only, focus rings use the documented token, and
  reduced-motion rules remain intact.

## Findings

No actionable P0, P1, or P2 differences remain for the requested layout or sidebar
behavior.

## Comparison history

1. Initial implementation — `blocked`.
   - P1: dark surfaces were paired with light-theme semantic text/control values,
     reducing readability.
   - Fix: resolved the dark theme on the document root so semantic aliases inherit
     the correct foreground, surface, border, and button values.
   - Post-fix evidence: `.qa/reference-library-implementation-v4.png`.
2. First normalized comparison — `blocked`.
   - P2: twelve cards left excessive empty canvas at the matched tall viewport and
     drifted from the source's archive density.
   - Fix: added eight additional real pricing and showcase captures, for twenty
     varied references across About, Product, Pricing, and Case Studies.
   - Post-fix evidence: `.qa/reference-library-final-1280x1000-v3.png`.
3. Sidebar behavior follow-up — `blocked`.
   - P1: the new library sidebar was fixed-width while the prior RefNest shell had a
     draggable, bounded, keyboard-accessible divider.
   - Fix: extracted the old divider into a shared `SidebarResizeHandle`, reused the
     existing `useSidebar` behavior, and made the library rail reflow the masonry
     canvas between `232px` and `360px`.
   - Post-fix evidence:
     `.qa/reference-library-resizable-final-1280x1000.png` and
     `.qa/reference-library-resizable-comparison-1280x1000.jpg`.
4. Filter presentation follow-up — `blocked`.
   - P2: the filter controls were rendered as an inline strip, shifting every
     thumbnail downward whenever filters opened.
   - Fix: moved the controls into the existing Radix popover pattern anchored to the
     navbar filter icon, with outside-click and Escape dismissal plus focus return.
   - Post-fix evidence: `.qa/reference-library-filter-popup-native.png` and
     `.qa/reference-library-filter-popup-outside-dismissed-native.png`.
5. Final comparison — `passed`.
   - No actionable P0/P1/P2 mismatch remains after the visual, interaction,
     responsive, accessibility, and token checks.

## Primary interactions checked

- Left sidebar separator: keyboard resize changed `272 → 288px`; repeated arrows
  clamped exactly at `232px` and `360px`; pointer-flow simulation changed
  `288 → 328px` and the masonry canvas reflowed with it.
- Responsive behavior at `800 × 800`: the desktop resize handle is hidden, the
  sidebar becomes a fixed drawer, the main canvas remains full width, and the mobile
  sidebar button is available.
- Right inspector: collapse and reopen both update the accessible state and canvas
  width.
- Filters, notification popover, add menu, folder selection/search, reference search,
  thumbnail selection, and selected-item inspector state all update in the live DOM.
- Opening the filter popup kept the first card at exactly `65px` from the viewport
  top; selecting `Editorial` changed the visible result count from `20` to `9`
  without closing or shifting the panel. Escape returned focus to the trigger, and
  both Escape and a real outside pointer click dismissed the popup.
- Browser console instrumentation recorded no `console.error`, `error`, or
  `unhandledrejection` entries across the primary interaction pass.

## Implementation checklist

- [x] Reuse the prior bounded sidebar resize behavior.
- [x] Support mouse/pointer drag and Left/Right arrow nudging.
- [x] Expose separator orientation, bounds, and current value to assistive tech.
- [x] Keep resize direct and interruption-safe with no lagging width animation.
- [x] Reflow masonry content continuously as sidebar width changes.
- [x] Preserve the mobile drawer breakpoint and right-inspector collapse behavior.
- [x] Present filters in a navbar-anchored popup without changing grid geometry.
- [x] Dismiss the filter popup with its close control, Escape, or an outside click.
- [x] Use semantic design tokens and real reference imagery.

## Follow-up polish

No P3 follow-up is required for this change.

final result: passed
