import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["recast-navigation"],
  },
  assetsInclude: ["**/*.glb", "**/*.wasm"],
  server: {
    port: 5173,
    host: true,
  },
});
