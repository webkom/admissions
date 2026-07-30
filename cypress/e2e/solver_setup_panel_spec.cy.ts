import { visitStaticFixture } from "../support/staticFixtures";

const mountSolverSetup = (
  scenario: "ready" | "blocked" | "loading" = "ready",
) => {
  visitStaticFixture("solver-setup-panel", { scenario });
  cy.get("[data-cy=solver-setup-harness]").should("exist");
};

describe("solver setup layer", () => {
  it("generates from a ready state and keeps advanced focus restoration", () => {
    mountSolverSetup();
    cy.get("[data-cy=generate-proposal]").click();
    cy.get("[data-cy=solve-count]").should("have.text", "1");

    cy.get("[data-cy=open-advanced-generation-settings]").click();
    cy.get("#advanced-generation-settings-heading")
      .should("be.focused")
      .type("{esc}");
    cy.get("[data-cy=generation-workspace]").should("not.exist");
    cy.focused().should(
      "have.attr",
      "data-cy",
      "open-advanced-generation-settings",
    );
  });

  it("shows one corrective action when availability is blocked", () => {
    mountSolverSetup("blocked");
    cy.get('[role="alert"]').should(
      "contain.text",
      "Vent til alle intervjuere",
    );
    cy.contains("button", "Se hvem som mangler").click();
    cy.get("[data-cy=navigation-action]").should("have.text", "availability");
    cy.get("[data-cy=generate-proposal]").should("be.disabled");
  });

  it("shows progress and cancellation while a solve is running", () => {
    mountSolverSetup("loading");
    cy.get('[role="progressbar"][aria-label="Genererer plan"]').should(
      "be.visible",
    );
    cy.get('[aria-live="polite"]').should("not.have.text", "");
    cy.contains("button", "Avbryt").should("be.visible");
    cy.get("[data-cy=generate-proposal]").should("not.exist");
  });
});
