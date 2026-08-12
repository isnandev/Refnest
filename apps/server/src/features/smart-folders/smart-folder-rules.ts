import type { InspirationReference, SmartFolder } from "@refnest/contracts"

export const matchesSmartFolder = (
  reference: InspirationReference,
  folder: Pick<SmartFolder, "ruleKind" | "ruleValue" | "withinDays">,
  nowMillis = Date.now()
) => {
  switch (folder.ruleKind) {
    case "recently-added":
      return (
        reference.status === "active" &&
        folder.withinDays !== null &&
        reference.createdAt.epochMillis >=
          nowMillis - folder.withinDays * 24 * 60 * 60 * 1_000
      )
    case "recently-used":
      return (
        reference.status === "active" &&
        folder.withinDays !== null &&
        reference.lastViewedAt !== null &&
        reference.lastViewedAt.epochMillis >=
          nowMillis - folder.withinDays * 24 * 60 * 60 * 1_000
      )
    case "favorites":
      return reference.status === "active" && reference.favorite
    case "uncategorized":
      return reference.status === "active" && reference.folderId === null
    case "untagged":
      return reference.status === "active" && reference.tags.length === 0
    case "trash":
      return reference.status === "trash"
    case "tag":
      return (
        reference.status === "active" &&
        folder.ruleValue !== null &&
        reference.tags.some(
          (tag) => tag.toLocaleLowerCase() === folder.ruleValue?.toLocaleLowerCase()
        )
      )
  }
}
