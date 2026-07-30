describe("shared scheduler grid foundation", () => {
  beforeEach(() => {
    cy.visit(
      "http://localhost:5001/static/cypress/fixtures/scheduler-foundation.html",
    );
    cy.get("[data-cy=scheduler-foundation-harness]").should("exist");
  });

  it("keeps one keyboard path across rows and columns", () => {
    cy.get('table[aria-label="Delt planleggingsrutenett"]').should("exist");
    cy.get('[role="button"][aria-label^="2026-07-21-480,"]')
      .should("have.attr", "tabindex", "0")
      .and("have.attr", "aria-pressed", "true")
      .focus()
      .type("{enter}")
      .should("have.attr", "aria-pressed", "false");

    cy.focused().type("{rightarrow}");
    cy.focused()
      .should("have.attr", "aria-label")
      .and("match", /^2026-07-22-480,/);
    cy.focused().type("{downarrow}");
    cy.focused()
      .should("have.attr", "aria-label")
      .and("match", /^2026-07-22-600,/);
  });

  it("renders the shared block, segment, and legend primitives", () => {
    cy.get("[data-cy=scheduler-foundation-primitives]")
      .should("contain.text", "Valgt")
      .and("contain.text", "Ledig");
    cy.get("[data-cy=scheduler-foundation-block]")
      .find("[data-schedule-slot-segment]")
      .should("have.length", 2);
  });

  it("renders the shared calendar view and editable panel chip", () => {
    cy.get("[data-cy=scheduler-foundation-harness]")
      .should("have.attr", "data-workspace-mode", "preview")
      .and(
        "have.attr",
        "data-calendar-contracts",
        "CalendarMonthGrid,CalendarPopoverDialog",
      )
      .and(
        "have.attr",
        "data-dialog-contracts",
        "ConfirmDialog,StatusToast,WizardTour,useWizardTour",
      )
      .and("have.attr", "data-toast-contract", "nullable");
    cy.get("[data-cy=scheduler-foundation-calendar-view]")
      .should("contain.text", "Kandidat")
      .and("contain.text", "Ada");
    cy.get('button[aria-label="Ada"]').click();
    cy.get('[role="listbox"]')
      .should("contain.text", "Ada")
      .and("contain.text", "Grace");
  });
});
