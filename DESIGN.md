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

- **`data-theme` on `<html>`** is the theme switch, matching the global source's
  documented selector. `.dark` is accepted as an alias so unmodified shadcn/ui
  `dark:` utilities keep working. The toggle lives in the topbar and persists to
  `localStorage`.
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

## Screens

One view. A 52px topbar carries the title and the sidecar status badge; the
content region is the grey stage at 24px padding holding two card columns that
collapse to one below the `lg` breakpoint.

## Verification

- Status is never colour alone — each badge variant states its word and carries a
  glyph.
- Every interactive element takes the ring on `:focus-visible`.
- Timestamps use `.numeric` (tabular figures).
- `prefers-reduced-motion` reduces every transition to ~0ms.
