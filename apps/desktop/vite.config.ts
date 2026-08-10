import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const host = process.env["TAURI_DEV_HOST"]

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },

  // Vite options tailored for Tauri development, applied by `tauri dev` and `tauri build`.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    ...(host === undefined ? {} : { hmr: { protocol: "ws" as const, host, port: 1421 } }),
    watch: {
      ignored: ["**/src-tauri/**"]
    }
  }
})
