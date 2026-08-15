import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"

import { isTauriRuntime } from "@/features/window/tauri-runtime"
import { captureNotificationCopy } from "./capture-job"

export type DesktopToast = {
  readonly title: string
  readonly body: string
}

/** OS toast. No-ops when focused, disabled, or not Tauri. Click focuses the window. */
export const notifyDesktop = async (
  toast: DesktopToast,
  enabled = true
) => {
  if (!enabled || !isTauriRuntime()) return

  try {
    if (await getCurrentWindow().isFocused()) return
    await invoke("show_desktop_notification", toast)
  } catch {
    // Permission denied or the shell is gone — the in-app toast still stands.
  }
}

export const notifyCaptureSettled = (
  job: Parameters<typeof captureNotificationCopy>[0],
  enabled = true
) => notifyDesktop(captureNotificationCopy(job), enabled)
