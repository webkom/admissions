import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const projectRootDir = path.resolve(__dirname);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
    // Inline maps in dev for debugging; never ship source maps to production,
    // where they expose the full TypeScript source via devtools and bloat the
    // bundle.
    sourcemap: mode === "production" ? false : "inline",
  },
  resolve: {
    alias: {
      src: path.resolve(projectRootDir, "frontend/src"),
      assets: path.resolve(projectRootDir, "frontend/src/assets"),
      "~": path.resolve(projectRootDir, "node_modules"),
    },
  },
}));
