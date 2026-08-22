import { defineConfig } from "cypress";

export default defineConfig({
  allowCypressEnv: false,
  projectId: "w2s2pw",
  requestTimeout: 15000,
  setupNodeEvents(on) {
    // CI runs the browser without a focused, on-screen window, and
    // Chromium throttles requestAnimationFrame hard for a backgrounded or
    // occluded window - GSAP's ticker (gsap-core.js) is rAF-driven, so
    // every GSAP-timed transition in the suite (see expandContractMotion.ts)
    // inherits that throttling. The effect isn't a uniform slowdown: GSAP's
    // default lag smoothing caps how much elapsed time a throttled tick may
    // credit, so a starved tween can crawl well past its real duration
    // (a spec sampling it mid-flight reads it as never finishing) while a
    // tick that lands right on an already-settled frame reads full opacity
    // a spec expected to still be transitioning. Same root cause, two
    // different-looking failures. Disabling background throttling makes
    // the CI window tick like an actual focused browser, which is what
    // every transition assertion in the suite already assumes.
    on("before:browser:launch", (browser, launchOptions) => {
      if (browser.family === "chromium") {
        launchOptions.args.push(
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
        );
      }
      return launchOptions;
    });
  },
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
  // Tried runMode: 2 as a backstop for the fixture vite server occasionally
  // being unreachable for a moment (see vite.config.ts's watch.ignored -
  // that's the actual fix for the ECONNREFUSED this was added to catch).
  // It backfired: admin_schedule_settings_popover_spec.cy.tsx alone went
  // from 14s to 3m58s in CI, because several of its assertions are already
  // marginal there and now each burns up to three full 12s command
  // timeouts before giving up instead of one. The whole suite runs in a
  // single Electron process across all 28 specs, so that extra ~4 minutes
  // of sustained load early in the run (spec 4 of 28) degrades everything
  // after it - which is exactly why specs with no relation to this one
  // (solver_setup_panel_spec at 24/28, submit_application_spec at 27/28)
  // started failing only once retries landed, never before and never
  // locally. Confirmed against Drone history: the last green run on this
  // branch (build 5841) predates this option; the first red one (5848) is
  // the commit that added it. No retries.
  retries: 0,
  e2e: {
    baseUrl: "http://127.0.0.1:5002",
  },
});
