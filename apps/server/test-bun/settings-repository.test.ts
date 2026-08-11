import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  UpdateDesktopSettings,
  WindowPlacement
} from "@starter/contracts"
import { Effect } from "effect"
import { SettingsRepository } from "../src/features/settings/settings-repository"
import { settingsRepositoryLive } from "../src/features/settings/settings-repository-live"

const temporaryDirectories: Array<string> = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  )
})

describe("Bun SQLite settings repository", () => {
  it("survives closing and reopening the database", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tauri-effect-settings-"))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "settings.sqlite3")

    await Effect.runPromise(
      Effect.gen(function* () {
        const settings = yield* SettingsRepository
        yield* settings.update(
          new UpdateDesktopSettings({
            themePreference: "dark",
            sidebarCollapsed: true,
            sidebarWidth: 304,
            activeSection: "settings",
            windowPlacement: new WindowPlacement({
              x: -1320,
              y: 90,
              width: 1100,
              height: 760,
              maximized: true
            })
          })
        )
      }).pipe(Effect.provide(settingsRepositoryLive(databasePath)))
    )

    const reopened = await Effect.runPromise(
      Effect.gen(function* () {
        const settings = yield* SettingsRepository
        return yield* settings.get()
      }).pipe(Effect.provide(settingsRepositoryLive(databasePath)))
    )

    expect(reopened.themePreference).toBe("dark")
    expect(reopened.sidebarCollapsed).toBe(true)
    expect(reopened.sidebarWidth).toBe(304)
    expect(reopened.activeSection).toBe("settings")
    expect(reopened.windowPlacement).toEqual(
      new WindowPlacement({
        x: -1320,
        y: 90,
        width: 1100,
        height: 760,
        maximized: true
      })
    )
  })
})
