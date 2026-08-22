import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const projectRootDir = path.resolve(__dirname);

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: "/static/",
  root: projectRootDir,
  server: {
    port: 5001,
    strictPort: true,
    origin: "http://localhost:5001",
    watch: {
      // `root` is the whole repo, so without this the dev server's file
      // watcher also covers the Django backend (admissions/, with its
      // migrations and test fixtures), docs/, and members/ - directories
      // nothing here needs live-reloaded, but that DOES burn through a
      // CI container's inotify watch limit on a run long enough (the
      // Cypress step keeps this process alive for its whole ~15+ minute
      // suite), which showed up as the dev server dying mid-run with no
      // clear cause. Only frontend/ and cypress/ actually need watching.
      ignored: ["**/admissions/**", "**/docs/**", "**/members/**"],
    },
  },
  build: {
    outDir: "assets",
    assetsDir: "bundles",
    manifest: "vite-manifest.json",
    rollupOptions: {
      input: "frontend/src/index.tsx",
    },
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
