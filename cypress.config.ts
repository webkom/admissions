import { defineConfig } from "cypress";

export default defineConfig({
  allowCypressEnv: false,
  projectId: "w2s2pw",
  requestTimeout: 15000,
  // CI keeps the standalone fixture vite server (port 5001, used only by
  // the visual-preview specs) running for the whole ~15+ minute suite, and
  // it occasionally isn't reachable for a moment under CI resource
  // contention (ECONNREFUSED on an otherwise-healthy server) - a retry on
  // `cypress run` absorbs that without masking a real, reproducible
  // failure. No retries in `cypress open`: a human watching interactively
  // should see the first failure, not a silent extra attempt.
  retries: {
    runMode: 2,
    openMode: 0,
  },
  e2e: {
    baseUrl: "http://127.0.0.1:5002",
  },
});
