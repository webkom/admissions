import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

const projectRootDir = path.resolve(__dirname);
const cypressFixtureDirectory = path.resolve(
  projectRootDir,
  "cypress/fixtures",
);

const getCypressFixtureInputs = () => {
  if (!fs.existsSync(cypressFixtureDirectory)) {
    return "frontend/src/index.tsx";
  }

  const fixtureInputs = Object.fromEntries(
    fs
      .readdirSync(cypressFixtureDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
      .map((entry) => [
        entry.name.replace(/\.html$/, ""),
        path.resolve(cypressFixtureDirectory, entry.name),
      ]),
  );

  return Object.keys(fixtureInputs).length > 0
    ? fixtureInputs
    : "frontend/src/index.tsx";
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isCypressFixtureBuild = mode === "cypress-fixtures";

  return {
    plugins: [react()],
    base: "/static/",
    root: projectRootDir,
    server: {
      port: 5001,
      strictPort: true,
      origin: "http://localhost:5001",
    },
    build: {
      outDir: isCypressFixtureBuild
        ? process.env.CYPRESS_FIXTURE_OUT_DIR
        : "assets",
      emptyOutDir: true,
      assetsDir: "bundles",
      manifest: isCypressFixtureBuild ? false : "vite-manifest.json",
      rollupOptions: {
        input: isCypressFixtureBuild
          ? getCypressFixtureInputs()
          : "frontend/src/index.tsx",
      },
      // Inline maps in dev for debugging; never ship source maps to production,
      // where they expose the full TypeScript source via devtools and bloat the
      // bundle. Fixture builds stay compact to fit alongside headless Chrome.
      sourcemap:
        mode === "production" || isCypressFixtureBuild ? false : "inline",
    },
    resolve: {
      alias: [
        ...(isCypressFixtureBuild
          ? [
              {
                find: /^\/static\/frontend\//,
                replacement: `${path.resolve(projectRootDir, "frontend")}/`,
              },
            ]
          : []),
        {
          find: "src",
          replacement: path.resolve(projectRootDir, "frontend/src"),
        },
        {
          find: "assets",
          replacement: path.resolve(projectRootDir, "frontend/src/assets"),
        },
        {
          find: "~",
          replacement: path.resolve(projectRootDir, "node_modules"),
        },
      ],
    },
  };
});
