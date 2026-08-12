import { Database } from "bun:sqlite"
import { Context, Effect, Layer } from "effect"

export type SqliteDatabaseShape = {
  readonly connection: Database
}

export class SqliteDatabase extends Context.Tag("SqliteDatabase")<
  SqliteDatabase,
  SqliteDatabaseShape
>() {}

const migrate = (database: Database) => {
  database.run("PRAGMA busy_timeout = 5000")
  database.run("PRAGMA journal_mode = WAL")
  database.run("PRAGMA foreign_keys = ON")
  database.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS library_folders (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES library_folders(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(workspace_id, relative_path)
    );

    CREATE TABLE IF NOT EXISTS inspiration_references (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      folder_id TEXT REFERENCES library_folders(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      source_url TEXT NOT NULL,
      source TEXT NOT NULL,
      kind TEXT NOT NULL,
      asset_relative_path TEXT NOT NULL,
      preview_path TEXT,
      mime_type TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      duration_seconds REAL,
      file_size_bytes INTEGER NOT NULL,
      favorite INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      tags_json TEXT NOT NULL DEFAULT '[]',
      colors_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_viewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS smart_folders (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      rule_kind TEXT NOT NULL,
      rule_value TEXT,
      within_days INTEGER,
      built_in INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(workspace_id, name)
    );

    CREATE TABLE IF NOT EXISTS capture_jobs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      folder_id TEXT REFERENCES library_folders(id) ON DELETE SET NULL,
      url TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      auto_metadata INTEGER NOT NULL,
      reference_id TEXT REFERENCES inspiration_references(id) ON DELETE SET NULL,
      error TEXT,
      warning TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      base_url TEXT NOT NULL,
      model TEXT NOT NULL,
      api_key TEXT,
      local_provider INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS library_folders_workspace_idx
      ON library_folders(workspace_id, parent_id);
    CREATE INDEX IF NOT EXISTS inspiration_references_workspace_idx
      ON inspiration_references(workspace_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS inspiration_references_folder_idx
      ON inspiration_references(folder_id);
    CREATE INDEX IF NOT EXISTS smart_folders_workspace_idx
      ON smart_folders(workspace_id);
    CREATE INDEX IF NOT EXISTS capture_jobs_workspace_idx
      ON capture_jobs(workspace_id, created_at DESC);
  `)

  const aiSettingsColumns = database
    .query<{ readonly name: string }, []>("PRAGMA table_info(ai_settings)")
    .all()
  if (!aiSettingsColumns.some((column) => column.name === "local_provider")) {
    database.run(
      "ALTER TABLE ai_settings ADD COLUMN local_provider INTEGER NOT NULL DEFAULT 0"
    )
  }

  database
    .query<never, [string, string, string]>(`
      INSERT OR IGNORE INTO ai_settings (
        id, base_url, model, api_key, local_provider, enabled, updated_at
      )
      VALUES (1, ?, ?, NULL, 0, 0, ?)
    `)
    .run("https://api.openai.com/v1", "gpt-4.1-mini", new Date().toISOString())
}

const openDatabase = (databasePath: string) =>
  Effect.acquireRelease(
    Effect.try({
      try: () => {
        const connection = new Database(databasePath, { create: true, strict: true })
        migrate(connection)
        return SqliteDatabase.of({ connection })
      },
      catch: (cause) => new Error(`RefNest database could not be opened: ${String(cause)}`)
    }),
    ({ connection }) => Effect.sync(() => connection.close())
  )

export const sqliteDatabaseLive = (databasePath: string) =>
  Layer.scoped(SqliteDatabase, openDatabase(databasePath))
