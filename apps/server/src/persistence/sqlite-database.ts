import { Database } from "bun:sqlite"
import { DEFAULT_SHARE_PORT } from "@refnest/contracts"
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
      rating INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      tags_json TEXT NOT NULL DEFAULT '[]',
      colors_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      -- The source file's own timestamps, which are not this library's.
      file_created_at TEXT,
      file_modified_at TEXT,
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

    -- Libraries this device can reach. The local sidecar is not a row: it is
    -- always present and needs no stored address or credential.
    CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      device_token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_connected_at TEXT,
      UNIQUE(host, port)
    );

    CREATE TABLE IF NOT EXISTS sharing_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 0,
      port INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Devices this machine has granted access to. Tokens are stored as a
    -- sha-256 digest; the prefix exists only so the UI can show which is which.
    CREATE TABLE IF NOT EXISTS shared_devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      token_prefix TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT,
      revoked_at TEXT
    );

    -- At most one invite is outstanding at a time, so "Add a device" always
    -- replaces the previous code rather than leaving several codes live.
    CREATE TABLE IF NOT EXISTS pairing_invites (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      code_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0
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

  // A library saved before ratings and file timestamps existed keeps every row;
  // the added columns simply read as unrated and undated until something writes
  // them.
  const referenceColumns = database
    .query<
      { readonly name: string },
      []
    >("PRAGMA table_info(inspiration_references)")
    .all()
  const addReferenceColumn = (name: string, definition: string) => {
    if (referenceColumns.some((column) => column.name === name)) return
    database.run(
      `ALTER TABLE inspiration_references ADD COLUMN ${name} ${definition}`
    )
  }
  addReferenceColumn("rating", "INTEGER NOT NULL DEFAULT 0")
  addReferenceColumn("file_created_at", "TEXT")
  addReferenceColumn("file_modified_at", "TEXT")

  database
    .query<never, [string, string, string]>(`
      INSERT OR IGNORE INTO ai_settings (
        id, base_url, model, api_key, local_provider, enabled, updated_at
      )
      VALUES (1, ?, ?, NULL, 0, 0, ?)
    `)
    .run("https://api.openai.com/v1", "gpt-4.1-mini", new Date().toISOString())

  database
    .query<never, [number, string]>(`
      INSERT OR IGNORE INTO sharing_settings (id, enabled, port, updated_at)
      VALUES (1, 0, ?, ?)
    `)
    .run(DEFAULT_SHARE_PORT, new Date().toISOString())
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
