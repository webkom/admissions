import { defineConfig } from "cypress";

export default defineConfig({
  allowCypressEnv: false,
  projectId: "w2s2pw",
  requestTimeout: 15000,
  // The default 4s is enough on a developer machine but not on a loaded CI
  // runner, where the specs that measure transitions time out consistently
  // (all three attempts) rather than intermittently: a settled height read
  // mid-animation, an exit animation still in the DOM, and a helper that
  // samples 8 requestAnimationFrame frames, which CI throttles. This only
  // grants a condition longer to become true - an assertion that is
  // genuinely wrong still fails, just as before.
  defaultCommandTimeout: 12000,
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
