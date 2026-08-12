import {
  type CreateSmartFolder,
  LibraryNotFound,
  LibraryOperationFailed,
  ReferenceTag,
  type ReferenceTag as ReferenceTagType,
  SmartFolder,
  SmartFolderId,
  SmartFolderRuleKind,
  type UpdateSmartFolder,
  WorkspaceId
} from "@refnest/contracts"
import { Context, Effect, Layer, Schema } from "effect"
import { decodeSqliteDateTime } from "../../persistence/decode-sqlite-date-time"
import { SqliteDatabase } from "../../persistence/sqlite-database"
import { FolderService } from "../folders/folder-service"
import { ReferenceService } from "../references/reference-service"
import { matchesSmartFolder } from "./smart-folder-rules"

type SmartFolderRow = {
  readonly id: string
  readonly workspace_id: string
  readonly name: string
  readonly rule_kind: string
  readonly rule_value: string | null
  readonly within_days: number | null
  readonly built_in: number
  readonly created_at: string
  readonly updated_at: string
}

type NormalizedRule = {
  readonly ruleKind: SmartFolderRuleKind
  readonly ruleValue: ReferenceTagType | null
  readonly withinDays: number | null
}

const decodeRuleKind = Schema.decodeUnknownSync(SmartFolderRuleKind)
const decodeRuleValue = Schema.decodeUnknownSync(Schema.NullOr(ReferenceTag))

const operationFailure = (
  operation: "list" | "create" | "update" | "delete",
  reason: string
) => new LibraryOperationFailed({ operation, reason })

const normalizeRule = (
  ruleKind: SmartFolderRuleKind,
  ruleValue: string | null,
  withinDays: number | null
): Effect.Effect<NormalizedRule, LibraryOperationFailed> => {
  if (ruleKind === "tag") {
    if (ruleValue === null || ruleValue.trim().length === 0) {
      return Effect.fail(
        operationFailure("create", "A tag smart folder needs a tag value.")
      )
    }

    return Effect.succeed({
      ruleKind,
      ruleValue: decodeRuleValue(ruleValue.trim()),
      withinDays: null
    })
  }

  if (ruleKind === "recently-added" || ruleKind === "recently-used") {
    if (withinDays === null) {
      return Effect.fail(
        operationFailure("create", "A recent smart folder needs a day range.")
      )
    }

    return Effect.succeed({ ruleKind, ruleValue: null, withinDays })
  }

  return Effect.succeed({ ruleKind, ruleValue: null, withinDays: null })
}

const fromRow = (row: SmartFolderRow, itemCount: number) =>
  new SmartFolder({
    id: SmartFolderId.make(row.id),
    workspaceId: WorkspaceId.make(row.workspace_id),
    name: row.name,
    ruleKind: decodeRuleKind(row.rule_kind),
    ruleValue: decodeRuleValue(row.rule_value),
    withinDays: row.within_days,
    builtIn: row.built_in === 1,
    itemCount,
    createdAt: decodeSqliteDateTime(row.created_at),
    updatedAt: decodeSqliteDateTime(row.updated_at)
  })

export type SmartFolderServiceShape = {
  readonly list: (
    workspaceId: WorkspaceId
  ) => Effect.Effect<
    ReadonlyArray<SmartFolder>,
    LibraryNotFound | LibraryOperationFailed
  >
  readonly get: (
    id: SmartFolderId
  ) => Effect.Effect<SmartFolder, LibraryNotFound | LibraryOperationFailed>
  readonly getScoped: (
    workspaceId: WorkspaceId,
    id: SmartFolderId
  ) => Effect.Effect<SmartFolder, LibraryNotFound | LibraryOperationFailed>
  readonly create: (
    input: CreateSmartFolder
  ) => Effect.Effect<SmartFolder, LibraryNotFound | LibraryOperationFailed>
  readonly update: (
    id: SmartFolderId,
    input: UpdateSmartFolder
  ) => Effect.Effect<SmartFolder, LibraryNotFound | LibraryOperationFailed>
  readonly updateScoped: (
    workspaceId: WorkspaceId,
    id: SmartFolderId,
    input: UpdateSmartFolder
  ) => Effect.Effect<SmartFolder, LibraryNotFound | LibraryOperationFailed>
  readonly remove: (
    id: SmartFolderId
  ) => Effect.Effect<void, LibraryNotFound | LibraryOperationFailed>
  readonly removeScoped: (
    workspaceId: WorkspaceId,
    id: SmartFolderId
  ) => Effect.Effect<void, LibraryNotFound | LibraryOperationFailed>
}

export class SmartFolderService extends Context.Tag("SmartFolderService")<
  SmartFolderService,
  SmartFolderServiceShape
>() {}

const makeSmartFolderService = Effect.gen(function* () {
  const { connection } = yield* SqliteDatabase
  const folders = yield* FolderService
  const references = yield* ReferenceService

  const selectByWorkspace = connection.query<SmartFolderRow, [WorkspaceId]>(`
    SELECT id, workspace_id, name, rule_kind, rule_value, within_days, built_in,
      created_at, updated_at
    FROM smart_folders
    WHERE workspace_id = ?
    ORDER BY built_in DESC, created_at ASC
  `)
  const selectById = connection.query<SmartFolderRow, [SmartFolderId]>(`
    SELECT id, workspace_id, name, rule_kind, rule_value, within_days, built_in,
      created_at, updated_at
    FROM smart_folders
    WHERE id = ?
  `)
  const insertFolder = connection.query<
    never,
    [
      SmartFolderId,
      WorkspaceId,
      string,
      SmartFolderRuleKind,
      ReferenceTagType | null,
      number | null,
      string,
      string
    ]
  >(`
    INSERT INTO smart_folders (
      id, workspace_id, name, rule_kind, rule_value, within_days, built_in,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `)
  const updateFolder = connection.query<
    never,
    [string, SmartFolderRuleKind, ReferenceTagType | null, number | null, string, SmartFolderId]
  >(`
    UPDATE smart_folders
    SET name = ?, rule_kind = ?, rule_value = ?, within_days = ?, updated_at = ?
    WHERE id = ?
  `)
  const deleteFolder = connection.query<never, [SmartFolderId]>(`
    DELETE FROM smart_folders WHERE id = ?
  `)

  const loadRow = Effect.fn("SmartFolderService.loadRow")(function* (
    id: SmartFolderId
  ) {
    const row = yield* Effect.try({
      try: () => selectById.get(id),
      catch: () => operationFailure("list", "The smart folder could not be loaded.")
    })

    if (row === null) {
      return yield* new LibraryNotFound({ resource: "smart-folder", id })
    }

    return row
  })

  const list = Effect.fn("SmartFolderService.list")(function* (
    workspaceId: WorkspaceId
  ) {
    yield* folders.resolveDestination(workspaceId, null)
    const rows = yield* Effect.try({
      try: () => selectByWorkspace.all(workspaceId),
      catch: () => operationFailure("list", "Smart folders could not be loaded.")
    })
    const active = yield* references.list({ workspaceId, view: "all" })
    const trash = yield* references.list({ workspaceId, view: "trash" })
    const allReferences = [...active, ...trash]

    return yield* Effect.try({
      try: () =>
        rows.map((row) => {
          const folder = fromRow(row, 0)
          const itemCount = allReferences.filter((reference) =>
            matchesSmartFolder(reference, folder)
          ).length
          return fromRow(row, itemCount)
        }),
      catch: () =>
        operationFailure("list", "Stored smart folder metadata is invalid.")
    })
  })

  const get = Effect.fn("SmartFolderService.get")(function* (id: SmartFolderId) {
    const row = yield* loadRow(id)
    const workspaceFolders = yield* list(WorkspaceId.make(row.workspace_id))
    const folder = workspaceFolders.find((candidate) => candidate.id === id)

    if (folder === undefined) {
      return yield* new LibraryNotFound({ resource: "smart-folder", id })
    }

    return folder
  })

  const getScoped = Effect.fn("SmartFolderService.getScoped")(function* (
    workspaceId: WorkspaceId,
    id: SmartFolderId
  ) {
    const folder = yield* get(id)
    if (folder.workspaceId !== workspaceId) {
      return yield* new LibraryNotFound({ resource: "smart-folder", id })
    }
    return folder
  })

  const create = Effect.fn("SmartFolderService.create")(function* (
    input: CreateSmartFolder
  ) {
    yield* folders.resolveDestination(input.workspaceId, null)
    const rule = yield* normalizeRule(
      input.ruleKind,
      input.ruleValue,
      input.withinDays
    )
    const id = SmartFolderId.make(`smart_${crypto.randomUUID()}`)
    const now = new Date().toISOString()

    yield* Effect.try({
      try: () =>
        insertFolder.run(
          id,
          input.workspaceId,
          input.name,
          rule.ruleKind,
          rule.ruleValue,
          rule.withinDays,
          now,
          now
        ),
      catch: () =>
        operationFailure(
          "create",
          "A smart folder with this name already exists in the workspace."
        )
    })

    return yield* get(id)
  })

  const update = Effect.fn("SmartFolderService.update")(function* (
    id: SmartFolderId,
    input: UpdateSmartFolder
  ) {
    const row = yield* loadRow(id)
    if (row.built_in === 1) {
      return yield* operationFailure(
        "update",
        "Built-in smart folders cannot be changed."
      )
    }

    const rule = yield* normalizeRule(
      input.ruleKind ?? decodeRuleKind(row.rule_kind),
      input.ruleValue === undefined ? row.rule_value : input.ruleValue,
      input.withinDays === undefined ? row.within_days : input.withinDays
    ).pipe(
      Effect.mapError((error) =>
        operationFailure("update", error.reason)
      )
    )
    const now = new Date().toISOString()

    yield* Effect.try({
      try: () =>
        updateFolder.run(
          input.name ?? row.name,
          rule.ruleKind,
          rule.ruleValue,
          rule.withinDays,
          now,
          id
        ),
      catch: () => operationFailure("update", "The smart folder could not be saved.")
    })

    return yield* get(id)
  })

  const remove = Effect.fn("SmartFolderService.remove")(function* (
    id: SmartFolderId
  ) {
    const row = yield* loadRow(id)
    if (row.built_in === 1) {
      return yield* operationFailure(
        "delete",
        "Built-in smart folders cannot be removed."
      )
    }

    yield* Effect.try({
      try: () => deleteFolder.run(id),
      catch: () => operationFailure("delete", "The smart folder could not be removed.")
    })
  })

  const updateScoped = Effect.fn("SmartFolderService.updateScoped")(function* (
    workspaceId: WorkspaceId,
    id: SmartFolderId,
    input: UpdateSmartFolder
  ) {
    yield* getScoped(workspaceId, id)
    return yield* update(id, input)
  })

  const removeScoped = Effect.fn("SmartFolderService.removeScoped")(function* (
    workspaceId: WorkspaceId,
    id: SmartFolderId
  ) {
    yield* getScoped(workspaceId, id)
    return yield* remove(id)
  })

  return SmartFolderService.of({
    list,
    get,
    getScoped,
    create,
    update,
    updateScoped,
    remove,
    removeScoped
  })
})

export const SmartFolderServiceLive = Layer.effect(
  SmartFolderService,
  makeSmartFolderService
)
