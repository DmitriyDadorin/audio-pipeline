import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: [
      "onnxruntime-web",
      "onnxruntime-web/wasm",
      "@ricky0123/vad-web",
    ],
  },
});
