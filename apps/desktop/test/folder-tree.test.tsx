import { FolderId } from "@refnest/contracts"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { FolderTree } from "@/features/library/folder-tree"
import { ALL_REFERENCES_SELECTION, PRIMARY_FOLDERS } from "@/features/library/library-data"

const webId = FolderId.make("folder_web")
const printId = FolderId.make("folder_print")

describe("folder tree sidebar", () => {
  it("puts a create-folder control in the folders header", () => {
    const markup = renderToStaticMarkup(
      <FolderTree
        primaryFolders={PRIMARY_FOLDERS}
        smartFolders={[]}
        collectionFolders={[
          {
            key: `folder:${webId}`,
            label: "Web",
            count: 8,
            selection: { kind: "folder", id: webId }
          },
          {
            key: `folder:${printId}`,
            label: "Print",
            count: 2,
            selection: { kind: "folder", id: printId }
          }
        ]}
        activeSelection={ALL_REFERENCES_SELECTION}
        onSelect={() => undefined}
        onCreateFolder={() => undefined}
        onMoveFolder={async () => true}
      />
    )

    expect(markup).toContain('aria-label="Create folder"')
    expect(markup).toContain("Folders")
    expect(markup).toContain("Web")
    expect(markup).toContain("draggable=\"true\"")
    expect(markup).not.toContain("Archive")
  })

  it("disables create when the workspace is not ready", () => {
    const markup = renderToStaticMarkup(
      <FolderTree
        primaryFolders={PRIMARY_FOLDERS}
        smartFolders={[]}
        collectionFolders={[]}
        activeSelection={ALL_REFERENCES_SELECTION}
        createDisabled
        onSelect={() => undefined}
        onCreateFolder={() => undefined}
        onMoveFolder={async () => true}
      />
    )

    expect(markup).toContain('aria-label="Create folder"')
    expect(markup).toContain("disabled")
  })
})
