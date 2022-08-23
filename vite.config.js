import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const projectRootDir = path.resolve(__dirname);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/static/",
  server: {
    port: 5001,
    strictPort: true,
    origin: "http://localhost:5001",
  },
  build: {
    outDir: "assets/bundles/",
    manifest: "vite-manifest.json",
    rollupOptions: {
      input: "frontend/src/index.jsx",
    },
    sourcemap: "inline",
  },
  resolve: {
    alias: {
      src: path.resolve(projectRootDir, "frontend/src"),
      assets: path.resolve(projectRootDir, "frontend/src/assets"),
    },
  },
});
