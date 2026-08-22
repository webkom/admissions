import { defineConfig } from "cypress";

export default defineConfig({
  allowCypressEnv: false,
  projectId: "w2s2pw",
  requestTimeout: 15000,
  // Needed together with the reduced-motion default in support/e2e.ts, and
  // only visible once that landed. Three CI runs separate the two causes:
  // with motion still reduced, a longer timeout changed nothing (a spec
  // sampling a mid-fade read the settled value and failed instantly); with
  // motion restored but 4s, the transitions run but a loaded runner does
  // not finish them in time - a height read mid-animation, an exit
  // animation still in the DOM, a helper sampling 8 animation frames.
  // Raising the default only grants a condition longer to become true; an
  // assertion that is genuinely wrong still fails exactly as before.
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
