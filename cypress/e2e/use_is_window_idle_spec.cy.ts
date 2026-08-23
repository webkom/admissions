const IDLE_AFTER_MS = 5000;

const mountProbe = () => {
  cy.clock();
  cy.visit(
    `http://localhost:5001/static/cypress/fixtures/idle-probe.html?idleAfterMs=${IDLE_AFTER_MS}`,
  );
  cy.get("[data-cy=idle-probe]").should("exist");
};

const fireActivity = () =>
  cy.window().then((window) => {
    window.dispatchEvent(new Event("mousemove"));
  });

describe("useIsWindowIdle", () => {
  it("starts non-idle and goes idle only once the full window elapses with no activity", () => {
    mountProbe();
    cy.get("[data-cy=idle-probe]").should("have.text", "false");

    cy.tick(IDLE_AFTER_MS - 1);
    cy.get("[data-cy=idle-probe]").should("have.text", "false");

    cy.tick(1);
    cy.get("[data-cy=idle-probe]").should("have.text", "true");
  });

  it("resets the window on activity, not just flips the flag", () => {
    mountProbe();
    cy.tick(IDLE_AFTER_MS - 1);
    cy.get("[data-cy=idle-probe]").should("have.text", "false");

    fireActivity();
    cy.get("[data-cy=idle-probe]").should("have.text", "false");

    // If activity only flipped the flag without restarting the timer, the
    // single remaining millisecond from before the reset would still be
    // enough to go idle here. It is a fresh IDLE_AFTER_MS window instead.
    cy.tick(1);
    cy.get("[data-cy=idle-probe]").should("have.text", "false");

    cy.tick(IDLE_AFTER_MS - 1);
    cy.get("[data-cy=idle-probe]").should("have.text", "true");
  });

  it("comes back from idle immediately on the next activity", () => {
    mountProbe();
    cy.tick(IDLE_AFTER_MS);
    cy.get("[data-cy=idle-probe]").should("have.text", "true");

    fireActivity();
    cy.get("[data-cy=idle-probe]").should("have.text", "false");
  });
});
