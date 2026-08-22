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
      // `root` is the whole repo, but only frontend/ and cypress/ hold
      // anything this server serves or should reload on. That matters most
      // in CI: Drone shares one workspace volume across steps, so by the
      // time the Cypress step starts, the earlier tox run has left a
      // ~32k-file .tox/ virtualenv (plus .venv/) sitting in the repo root.
      // Watching those swamps the container's inotify budget, and the dev
      // server - which the Cypress step keeps alive for its whole ~15+
      // minute suite - dies partway through, leaving every remaining
      // fixture spec with ECONNREFUSED on port 5001.
      //
      // Anchored to projectRootDir rather than written as bare `**/x/**`
      // globs on purpose: the repo directory itself is named "admissions",
      // so a bare `**/admissions/**` also matches the project root in a
      // normal checkout and silently ignores the entire tree.
      ignored: [
        path.resolve(projectRootDir, ".tox/**"),
        path.resolve(projectRootDir, ".venv/**"),
        path.resolve(projectRootDir, "admissions/**"),
        path.resolve(projectRootDir, "assets/**"),
        path.resolve(projectRootDir, "docs/**"),
        path.resolve(projectRootDir, "members/**"),
      ],
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
