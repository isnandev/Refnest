import { HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { WorkspaceId } from "./workspace"

export const SIDEBAR_BACKGROUND_OPACITY_MIN = 40
export const SIDEBAR_BACKGROUND_OPACITY_MAX = 80
export const SIDEBAR_WIDTH_MIN = 232
export const SIDEBAR_WIDTH_MAX = 360
export const WINDOW_WIDTH_MIN = 720
export const WINDOW_HEIGHT_MIN = 540

export const ThemePreference = Schema.Literal("system", "light", "dark")
export type ThemePreference = typeof ThemePreference.Type

export const AppSection = Schema.Literal(
  "overview",
  "new-note",
  "runtime",
  "output",
  "settings"
)
export type AppSection = typeof AppSection.Type

const WindowCoordinate = Schema.Int.pipe(Schema.between(-100_000, 100_000))
const WindowWidth = Schema.Int.pipe(Schema.between(WINDOW_WIDTH_MIN, 20_000))
const WindowHeight = Schema.Int.pipe(Schema.between(WINDOW_HEIGHT_MIN, 20_000))
const SidebarWidth = Schema.Int.pipe(
  Schema.between(SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX)
)
const SidebarBackgroundOpacity = Schema.Int.pipe(
  Schema.between(
    SIDEBAR_BACKGROUND_OPACITY_MIN,
    SIDEBAR_BACKGROUND_OPACITY_MAX
  )
)

export class WindowPlacement extends Schema.Class<WindowPlacement>(
  "WindowPlacement"
)({
  x: WindowCoordinate,
  y: WindowCoordinate,
  width: WindowWidth,
  height: WindowHeight,
  maximized: Schema.Boolean
}) {}

export class DesktopSettings extends Schema.Class<DesktopSettings>(
  "DesktopSettings"
)({
  themePreference: ThemePreference,
  autoCollapseSidebar: Schema.Boolean,
  autoConvertImports: Schema.Boolean,
  reduceMotion: Schema.Boolean,
  sidebarBackgroundOpacity: SidebarBackgroundOpacity,
  sidebarWidth: SidebarWidth,
  sidebarCollapsed: Schema.Boolean,
  selectedWorkspaceId: Schema.NullOr(WorkspaceId),
  activeSection: AppSection,
  windowPlacement: Schema.NullOr(WindowPlacement)
}) {}

export class UpdateDesktopSettings extends Schema.Class<UpdateDesktopSettings>(
  "UpdateDesktopSettings"
)({
  themePreference: Schema.optional(ThemePreference),
  autoCollapseSidebar: Schema.optional(Schema.Boolean),
  autoConvertImports: Schema.optional(Schema.Boolean),
  reduceMotion: Schema.optional(Schema.Boolean),
  sidebarBackgroundOpacity: Schema.optional(SidebarBackgroundOpacity),
  sidebarWidth: Schema.optional(SidebarWidth),
  sidebarCollapsed: Schema.optional(Schema.Boolean),
  selectedWorkspaceId: Schema.optional(Schema.NullOr(WorkspaceId)),
  activeSection: Schema.optional(AppSection),
  windowPlacement: Schema.optional(Schema.NullOr(WindowPlacement))
}) {}

export const SettingsPersistenceOperation = Schema.Literal("load", "save")

export class SettingsPersistenceFailed extends Schema.TaggedError<SettingsPersistenceFailed>()(
  "SettingsPersistenceFailed",
  {
    operation: SettingsPersistenceOperation,
    reason: Schema.NonEmptyTrimmedString
  },
  HttpApiSchema.annotations({ status: 500 })
) {
  override get message(): string {
    return this.reason
  }
}

export const DEFAULT_DESKTOP_SETTINGS = new DesktopSettings({
  themePreference: "system",
  autoCollapseSidebar: true,
  autoConvertImports: true,
  reduceMotion: false,
  sidebarBackgroundOpacity: 60,
  sidebarWidth: 272,
  sidebarCollapsed: false,
  selectedWorkspaceId: null,
  activeSection: "overview",
  windowPlacement: null
})

export const mergeDesktopSettings = (
  current: DesktopSettings,
  patch: UpdateDesktopSettings
) =>
  new DesktopSettings({
    themePreference: patch.themePreference ?? current.themePreference,
    autoCollapseSidebar:
      patch.autoCollapseSidebar ?? current.autoCollapseSidebar,
    autoConvertImports: patch.autoConvertImports ?? current.autoConvertImports,
    reduceMotion: patch.reduceMotion ?? current.reduceMotion,
    sidebarBackgroundOpacity:
      patch.sidebarBackgroundOpacity ?? current.sidebarBackgroundOpacity,
    sidebarWidth: patch.sidebarWidth ?? current.sidebarWidth,
    sidebarCollapsed: patch.sidebarCollapsed ?? current.sidebarCollapsed,
    selectedWorkspaceId:
      patch.selectedWorkspaceId === undefined
        ? current.selectedWorkspaceId
        : patch.selectedWorkspaceId,
    activeSection: patch.activeSection ?? current.activeSection,
    windowPlacement:
      patch.windowPlacement === undefined
        ? current.windowPlacement
        : patch.windowPlacement
  })
