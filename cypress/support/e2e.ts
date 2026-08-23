// ***********************************************************
// This example support/e2e.ts is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

import "./commands";

// CI's headless Chrome reports prefers-reduced-motion: reduce, while a
// developer machine almost never does. That difference is invisible until a
// spec asserts on motion: the components honour motion-reduce and skip the
// transition entirely, so a test sampling a mid-fade opacity sees the
// settled value and fails only in CI ("expected 1 to be below 0.95").
//
// Pin the default to no-preference so the suite runs against the same
// motion behaviour everywhere. Specs that deliberately exercise reduced
// motion still set it themselves per test (see
// scheduler_release_acceptance_spec), and this beforeEach runs before
// theirs, so it seeds the default rather than fighting them.
beforeEach(() => {
  cy.then(() =>
    Cypress.automation("remote:debugger:protocol", {
      command: "Emulation.setEmulatedMedia",
      params: {
        media: "",
        features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
      },
    }),
  );
});
