import type { Database } from "bun:sqlite"
import type { WorkspaceId } from "@refnest/contracts"

const DEFAULT_SMART_FOLDERS = [
  {
    name: "Recently added",
    ruleKind: "recently-added",
    ruleValue: null,
    withinDays: 30
  },
  {
    name: "Dark interfaces",
    ruleKind: "tag",
    ruleValue: "Dark",
    withinDays: null
  },
  {
    name: "Editorial",
    ruleKind: "tag",
    ruleValue: "Editorial",
    withinDays: null
  }
] as const

export const seedDefaultSmartFolders = (
  database: Database,
  workspaceId: WorkspaceId,
  now: string
) => {
  const insert = database.query<
    never,
    [string, WorkspaceId, string, string, string | null, number | null, string, string]
  >(`
    INSERT OR IGNORE INTO smart_folders (
      id,
      workspace_id,
      name,
      rule_kind,
      rule_value,
      within_days,
      built_in,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `)

  for (const folder of DEFAULT_SMART_FOLDERS) {
    insert.run(
      `smart_${crypto.randomUUID()}`,
      workspaceId,
      folder.name,
      folder.ruleKind,
      folder.ruleValue,
      folder.withinDays,
      now,
      now
    )
  }
}
