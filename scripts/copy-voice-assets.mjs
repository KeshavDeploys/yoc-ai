import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { mkdir, readdir, copyFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const vadDir = dirname(require.resolve("@ricky0123/vad-web"));
const ortDir = dirname(require.resolve("onnxruntime-web/wasm"));
const target = join(process.cwd(), "public", "voice-vad");
await mkdir(target, { recursive: true });
for (const [source, accepts] of [
  [vadDir, (name) => name === "silero_vad_v5.onnx" || name === "vad.worklet.bundle.min.js"],
  [ortDir, (name) => name === "ort-wasm-simd-threaded.wasm" || name === "ort-wasm-simd-threaded.mjs"],
]) {
  for (const name of await readdir(source)) if (accepts(name)) await copyFile(join(source, name), join(target, name));
}
console.log("Voice VAD assets copied to public/voice-vad");