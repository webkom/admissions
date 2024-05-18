import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const projectRootDir = path.resolve(__dirname);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/static/",
  root: projectRootDir,
  server: {
    port: 5001,
    strictPort: true,
    origin: "http://localhost:5001",
  },
  build: {
    outDir: "assets",
    assetsDir: "bundles",
    manifest: "vite-manifest.json",
    rollupOptions: {
      input: "frontend/src/index.tsx",
    },
    sourcemap: "inline",
  },
  resolve: {
    alias: {
      src: path.resolve(projectRootDir, "frontend/src"),
      assets: path.resolve(projectRootDir, "frontend/src/assets"),
      "~": path.resolve(projectRootDir, "node_modules"),
    },
  },
});
