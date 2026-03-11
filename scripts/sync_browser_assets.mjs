import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const publicDir = resolve(projectRoot, "public");
const vadDir = resolve(publicDir, "vad");
const ortDir = resolve(publicDir, "ort");
const vendorDir = resolve(publicDir, "vendor");

mkdirSync(vadDir, { recursive: true });
mkdirSync(ortDir, { recursive: true });
mkdirSync(vendorDir, { recursive: true });

copy(
  "node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js",
  "public/vad/vad.worklet.bundle.min.js",
);
copy(
  "node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx",
  "public/vad/silero_vad_v5.onnx",
);
copy(
  "node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx",
  "public/vad/silero_vad_legacy.onnx",
);
copy(
  "node_modules/@ricky0123/vad-web/dist/bundle.min.js",
  "public/vendor/vad.bundle.min.js",
);
copy(
  "node_modules/onnxruntime-web/dist/ort.min.js",
  "public/vendor/ort.min.js",
);
copy(
  "node_modules/vosk-browser/dist/vosk.js",
  "public/vendor/vosk.js",
);
copy(
  "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
  "public/vendor/ort-wasm-simd-threaded.mjs",
);
copy(
  "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
  "public/vendor/ort-wasm-simd-threaded.wasm",
);
copy(
  "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
  "public/ort/ort-wasm-simd-threaded.wasm",
);

console.log("Browser assets synced to public/");

function copy(sourceRelative, targetRelative) {
  cpSync(resolve(projectRoot, sourceRelative), resolve(projectRoot, targetRelative));
}
