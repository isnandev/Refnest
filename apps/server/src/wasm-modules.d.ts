/**
 * Bun's `file` loader resolves a `.wasm` import to a path, and embeds the bytes
 * when the sidecar is built with `bun build --compile`.
 */
declare module "*.wasm" {
  const path: string
  export default path
}
