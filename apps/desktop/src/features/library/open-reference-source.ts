import { openUrl } from "@tauri-apps/plugin-opener"

import { isTauriRuntime } from "@/features/window/tauri-runtime"

export const openReferenceSource = async (sourceUrl: string) => {
  if (isTauriRuntime()) {
    await openUrl(sourceUrl)
    return
  }

  window.open(sourceUrl, "_blank", "noopener,noreferrer")
}
