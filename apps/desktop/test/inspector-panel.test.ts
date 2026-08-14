import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { EditableProperty } from "@/features/library/editable-property"
import { InspectorPanel } from "@/features/library/inspector-panel"

describe("reference inspector layout", () => {
  it("lets the inspector scroller shrink below intrinsic field width", () => {
    const markup = renderToStaticMarkup(
      createElement(InspectorPanel, {
        item: null,
        imageUrl: undefined,
        imageFailed: false,
        folders: [],
        folderLabel: "All references",
        itemCount: 0,
        canEnrich: false,
        pending: false,
        actionError: null,
        onClose: () => undefined,
        onEditMetadata: async () => false,
        onToggleFavorite: () => undefined,
        onTrash: () => undefined,
        onRestore: () => undefined,
        onEnrich: () => undefined,
        canConvert: false,
        onConvert: () => undefined,
        onExport: () => undefined,
        onOpenSource: () => undefined
      })
    )

    expect(markup).toContain(
      "inspector-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
    )
  })

  it("contains a long editable value inside the available field width", () => {
    const longUrl = `https://example.com/${"reference/".repeat(40)}`
    const markup = renderToStaticMarkup(
      createElement(EditableProperty, {
        label: "Link",
        value: longUrl,
        onCommit: async () => true,
        children: createElement(
          "span",
          { className: "block truncate" },
          longUrl
        )
      })
    )

    expect(markup).toContain("w-full min-w-0 max-w-full")
    expect(markup).toContain("overflow-hidden")
  })
})
