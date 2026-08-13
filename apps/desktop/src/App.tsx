import {
  LOCAL_ENVIRONMENT_ID,
  selectedWorkspaceId,
  UpdateDesktopSettings,
  type EnvironmentId,
  type LibraryViewPreferencesPatch,
  type ThemePreference,
  type WorkspaceId
} from "@refnest/contracts"
import { useCallback, useState } from "react"

import { ConverterPage } from "@/features/converter/converter-page"
import { useEnvironments } from "@/features/environments/use-environments"
import { useSharing } from "@/features/environments/use-sharing"
import { ReferenceLibrary } from "@/features/library/reference-library"
import { SettingsPage } from "@/features/settings/settings-page"
import { useAiSettings } from "@/features/settings/use-ai-settings"
import { useAppSettings } from "@/features/settings/use-app-settings"
import type { SidebarPreferences } from "@/features/shell/use-sidebar"
import { useTheme } from "@/features/theme/use-theme"
import { useWindowPersistence } from "@/features/window/use-window-persistence"
import { WorkspaceCreateModal } from "@/features/workspaces/workspace-create-modal"
import { useWorkspaces } from "@/features/workspaces/use-workspaces"

export default function App() {
  const appSettings = useAppSettings()
  const aiSettings = useAiSettings()
  const settings = appSettings.settings
  const settingsReady = appSettings.status !== "loading"
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [converterOpen, setConverterOpen] = useState(false)
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false)

  useWindowPersistence(
    settings.windowPlacement,
    settingsReady,
    appSettings.flush
  )

  const persistTheme = useCallback(
    (themePreference: ThemePreference) => {
      appSettings.update(new UpdateDesktopSettings({ themePreference }))
    },
    [appSettings.update]
  )
  const persistWorkspace = useCallback(
    (workspaceId: WorkspaceId) => {
      appSettings.update(
        new UpdateDesktopSettings({ selectedWorkspaceId: workspaceId })
      )
    },
    [appSettings.update]
  )
  const persistActiveEnvironment = useCallback(
    (activeEnvironmentId: EnvironmentId) => {
      appSettings.update(new UpdateDesktopSettings({ activeEnvironmentId }))
    },
    [appSettings.update]
  )
  const persistSidebar = useCallback(
    ({ width }: SidebarPreferences) => {
      appSettings.update(
        new UpdateDesktopSettings({
          sidebarWidth: Math.round(width),
          sidebarCollapsed: false
        })
      )
    },
    [appSettings.update]
  )
  const persistLibraryView = useCallback(
    (libraryView: LibraryViewPreferencesPatch) => {
      appSettings.update(new UpdateDesktopSettings({ libraryView }))
    },
    [appSettings.update]
  )

  const theme = useTheme(settings.themePreference, persistTheme)
  const environments = useEnvironments(
    settings.activeEnvironmentId,
    settingsReady,
    persistActiveEnvironment
  )
  const sharing = useSharing()
  const onLocalLibrary = settings.activeEnvironmentId === LOCAL_ENVIRONMENT_ID
  const workspaces = useWorkspaces(
    selectedWorkspaceId(settings),
    settingsReady,
    persistWorkspace
  )
  const aiEnabled =
    aiSettings.state.status === "ready" && aiSettings.state.settings.enabled

  return (
    <>
      {settingsOpen ? (
        <SettingsPage
          resolvedTheme={theme.theme}
          themePreference={theme.preference}
          settings={settings}
          saveError={appSettings.saveError}
          environments={environments}
          sharing={sharing}
          aiState={aiSettings.state}
          aiPending={aiSettings.pending}
          aiActionError={aiSettings.actionError}
          onThemePreferenceChange={theme.setPreference}
          onSettingChange={appSettings.update}
          onRetryAiSettings={() => void aiSettings.refresh()}
          onSaveAiSettings={async (patch) =>
            (await aiSettings.save(patch)) !== null
          }
          onReset={appSettings.resetPreferences}
          onClose={() => setSettingsOpen(false)}
        />
      ) : converterOpen ? (
        <ConverterPage onClose={() => setConverterOpen(false)} />
      ) : (
        <ReferenceLibrary
          workspaceState={workspaces.state}
          selectedWorkspace={workspaces.selectedWorkspace}
          sidebarPreferences={{
            width: settings.sidebarWidth,
            collapsed: false
          }}
          settingsReady={settingsReady}
          theme={theme.theme}
          aiEnabled={aiEnabled}
          libraryName={environments.active?.name ?? null}
          view={settings.libraryView}
          onViewChange={persistLibraryView}
          onLocalLibrary={onLocalLibrary}
          onSelectWorkspace={workspaces.select}
          onCreateWorkspace={() => {
            workspaces.clearActionError()
            setWorkspaceModalOpen(true)
          }}
          onSidebarPreferencesChange={persistSidebar}
          onOpenSettings={() => {
            aiSettings.clearActionError()
            setSettingsOpen(true)
          }}
          onOpenConverter={() => setConverterOpen(true)}
          onToggleTheme={theme.toggle}
        />
      )}

      <WorkspaceCreateModal
        open={workspaceModalOpen}
        pending={workspaces.pending}
        actionError={workspaces.actionError}
        onOpenChange={setWorkspaceModalOpen}
        onCreate={workspaces.create}
      />
    </>
  )
}
