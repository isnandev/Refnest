import { HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { EnvironmentId, LOCAL_ENVIRONMENT_ID } from "./environment"
import { ReferenceSortDirection, ReferenceSortField } from "./library"
import { WorkspaceId } from "./workspace"

export const LIBRARY_COLUMN_MIN = 1
export const LIBRARY_COLUMN_MAX = 8
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

export const LibraryLayout = Schema.Literal("masonry", "justified", "grid")
export type LibraryLayout = typeof LibraryLayout.Type

/**
 * `speed` renders the stored preview; `quality` renders the original asset,
 * which is sharper on a large thumbnail and heavier to load.
 */
export const ThumbnailQuality = Schema.Literal("speed", "quality")
export type ThumbnailQuality = typeof ThumbnailQuality.Type

export const ReferenceItemInfo = Schema.Literal(
  "dimensions",
  "size",
  "type",
  "date-added"
)
export type ReferenceItemInfo = typeof ReferenceItemInfo.Type

export const LibraryColumnCount = Schema.Int.pipe(
  Schema.between(LIBRARY_COLUMN_MIN, LIBRARY_COLUMN_MAX)
)

/** How the grid presents references. One document, so one popover owns it all. */
export class LibraryViewPreferences extends Schema.Class<LibraryViewPreferences>(
  "LibraryViewPreferences"
)({
  layout: LibraryLayout,
  columns: LibraryColumnCount,
  thumbnailQuality: ThumbnailQuality,
  sort: ReferenceSortField,
  sortDirection: ReferenceSortDirection,
  showName: Schema.Boolean,
  showItemInfo: Schema.Boolean,
  itemInfo: ReferenceItemInfo,
  showExtension: Schema.Boolean,
  showExtensionLabel: Schema.Boolean,
  showAnnotation: Schema.Boolean,
  showSubfolderContents: Schema.Boolean,
  showSidebar: Schema.Boolean,
  showInspector: Schema.Boolean
}) {}

export const LibraryViewPreferencesPatch = Schema.partial(
  Schema.Struct(LibraryViewPreferences.fields)
)
export type LibraryViewPreferencesPatch = typeof LibraryViewPreferencesPatch.Type

export const DEFAULT_LIBRARY_VIEW_PREFERENCES = new LibraryViewPreferences({
  layout: "masonry",
  columns: 5,
  thumbnailQuality: "speed",
  sort: "date-added",
  sortDirection: "desc",
  showName: true,
  showItemInfo: true,
  itemInfo: "dimensions",
  showExtension: true,
  showExtensionLabel: true,
  showAnnotation: false,
  showSubfolderContents: true,
  showSidebar: true,
  showInspector: false
})

/** Field by field, so an explicit `undefined` reads as "unchanged", not "clear". */
export const mergeLibraryViewPreferences = (
  current: LibraryViewPreferences,
  patch: LibraryViewPreferencesPatch
) =>
  new LibraryViewPreferences({
    layout: patch.layout ?? current.layout,
    columns: patch.columns ?? current.columns,
    thumbnailQuality: patch.thumbnailQuality ?? current.thumbnailQuality,
    sort: patch.sort ?? current.sort,
    sortDirection: patch.sortDirection ?? current.sortDirection,
    showName: patch.showName ?? current.showName,
    showItemInfo: patch.showItemInfo ?? current.showItemInfo,
    itemInfo: patch.itemInfo ?? current.itemInfo,
    showExtension: patch.showExtension ?? current.showExtension,
    showExtensionLabel: patch.showExtensionLabel ?? current.showExtensionLabel,
    showAnnotation: patch.showAnnotation ?? current.showAnnotation,
    showSubfolderContents:
      patch.showSubfolderContents ?? current.showSubfolderContents,
    showSidebar: patch.showSidebar ?? current.showSidebar,
    showInspector: patch.showInspector ?? current.showInspector
  })

/**
 * A workspace id only means something relative to one library, so the resume
 * selection is keyed by environment. Without this, a laptop would resume into a
 * workspace that exists on the host and nowhere else.
 */
const WorkspaceSelections = Schema.Record({
  key: EnvironmentId,
  value: WorkspaceId
})

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
  activeEnvironmentId: EnvironmentId,
  workspaceSelections: WorkspaceSelections,
  activeSection: AppSection,
  libraryView: LibraryViewPreferences,
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
  activeEnvironmentId: Schema.optional(EnvironmentId),
  /** Applies to the environment the same patch selects, or the active one. */
  selectedWorkspaceId: Schema.optional(Schema.NullOr(WorkspaceId)),
  activeSection: Schema.optional(AppSection),
  libraryView: Schema.optional(LibraryViewPreferencesPatch),
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
  activeEnvironmentId: LOCAL_ENVIRONMENT_ID,
  workspaceSelections: {},
  activeSection: "overview",
  libraryView: DEFAULT_LIBRARY_VIEW_PREFERENCES,
  windowPlacement: null
})

/** The workspace this device last used in the library it is currently pointed at. */
export const selectedWorkspaceId = (settings: DesktopSettings) =>
  settings.workspaceSelections[settings.activeEnvironmentId] ?? null

export const mergeDesktopSettings = (
  current: DesktopSettings,
  patch: UpdateDesktopSettings
) => {
  const activeEnvironmentId =
    patch.activeEnvironmentId ?? current.activeEnvironmentId
  const workspaceSelections = { ...current.workspaceSelections }

  if (patch.selectedWorkspaceId === null) {
    delete workspaceSelections[activeEnvironmentId]
  } else if (patch.selectedWorkspaceId !== undefined) {
    workspaceSelections[activeEnvironmentId] = patch.selectedWorkspaceId
  }

  return new DesktopSettings({
    themePreference: patch.themePreference ?? current.themePreference,
    autoCollapseSidebar:
      patch.autoCollapseSidebar ?? current.autoCollapseSidebar,
    autoConvertImports: patch.autoConvertImports ?? current.autoConvertImports,
    reduceMotion: patch.reduceMotion ?? current.reduceMotion,
    sidebarBackgroundOpacity:
      patch.sidebarBackgroundOpacity ?? current.sidebarBackgroundOpacity,
    sidebarWidth: patch.sidebarWidth ?? current.sidebarWidth,
    sidebarCollapsed: patch.sidebarCollapsed ?? current.sidebarCollapsed,
    activeEnvironmentId,
    workspaceSelections,
    activeSection: patch.activeSection ?? current.activeSection,
    libraryView:
      patch.libraryView === undefined
        ? current.libraryView
        : mergeLibraryViewPreferences(current.libraryView, patch.libraryView),
    windowPlacement:
      patch.windowPlacement === undefined
        ? current.windowPlacement
        : patch.windowPlacement
  })
}

/**
 * Every field optional, plus the pre-environments `selectedWorkspaceId`, so a
 * document written by an older build still loads. A settings row that cannot be
 * read at all should cost the user their preferences, not the whole app.
 */
const StoredDesktopSettings = Schema.Struct({
  themePreference: Schema.optional(ThemePreference),
  autoCollapseSidebar: Schema.optional(Schema.Boolean),
  autoConvertImports: Schema.optional(Schema.Boolean),
  reduceMotion: Schema.optional(Schema.Boolean),
  sidebarBackgroundOpacity: Schema.optional(SidebarBackgroundOpacity),
  sidebarWidth: Schema.optional(SidebarWidth),
  sidebarCollapsed: Schema.optional(Schema.Boolean),
  activeEnvironmentId: Schema.optional(EnvironmentId),
  workspaceSelections: Schema.optional(WorkspaceSelections),
  activeSection: Schema.optional(AppSection),
  libraryView: Schema.optional(LibraryViewPreferencesPatch),
  windowPlacement: Schema.optional(Schema.NullOr(WindowPlacement)),
  selectedWorkspaceId: Schema.optional(Schema.NullOr(WorkspaceId))
})

const decodeStored = Schema.decodeUnknownEither(StoredDesktopSettings)

export const decodeStoredDesktopSettings = (
  input: unknown
): DesktopSettings => {
  const stored = decodeStored(input)
  if (stored._tag === "Left") return DEFAULT_DESKTOP_SETTINGS

  const document = stored.right
  const selections = { ...(document.workspaceSelections ?? {}) }
  const legacyWorkspaceId = document.selectedWorkspaceId

  // A pre-environments document only ever described the local library.
  if (
    legacyWorkspaceId !== undefined &&
    legacyWorkspaceId !== null &&
    selections[LOCAL_ENVIRONMENT_ID] === undefined
  ) {
    selections[LOCAL_ENVIRONMENT_ID] = legacyWorkspaceId
  }

  const fallback = DEFAULT_DESKTOP_SETTINGS

  return new DesktopSettings({
    themePreference: document.themePreference ?? fallback.themePreference,
    autoCollapseSidebar:
      document.autoCollapseSidebar ?? fallback.autoCollapseSidebar,
    autoConvertImports:
      document.autoConvertImports ?? fallback.autoConvertImports,
    reduceMotion: document.reduceMotion ?? fallback.reduceMotion,
    sidebarBackgroundOpacity:
      document.sidebarBackgroundOpacity ?? fallback.sidebarBackgroundOpacity,
    sidebarWidth: document.sidebarWidth ?? fallback.sidebarWidth,
    sidebarCollapsed: document.sidebarCollapsed ?? fallback.sidebarCollapsed,
    activeEnvironmentId:
      document.activeEnvironmentId ?? fallback.activeEnvironmentId,
    workspaceSelections: selections,
    activeSection: document.activeSection ?? fallback.activeSection,
    // A document written before the view options existed still opens: every
    // preference it does not name falls back to the documented default.
    libraryView: mergeLibraryViewPreferences(
      fallback.libraryView,
      document.libraryView ?? {}
    ),
    windowPlacement: document.windowPlacement ?? fallback.windowPlacement
  })
}
