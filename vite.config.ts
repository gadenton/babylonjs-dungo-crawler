import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  optimizeDeps: {
    exclude: ["recast-navigation"],
  },
  assetsInclude: ["**/*.glb", "**/*.wasm"],
  server: {
    port: 5173,
    host: true,
  },
});

