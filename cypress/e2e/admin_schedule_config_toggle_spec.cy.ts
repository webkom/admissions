describe("admin schedule configuration toggles", () => {
  beforeEach(() => {
    cy.viewport(1440, 900);
    cy.login("webkom");
    cy.visit("/webkom-open/schedule", {
      onBeforeLoad(window) {
        window.localStorage.setItem("admissions.wizard.admin.v1", "1");
      },
    });
    cy.get('nav[aria-label="Steg i intervjuplanleggingen"]').within(() => {
      cy.contains("button", "Grunnlag").click();
    });
    cy.get('[role="tablist"][aria-label="Arbeidsområder i Grunnlag"]').within(
      () => {
        cy.contains('[role="tab"]', "Oppsett").click();
      },
    );
    cy.contains("Tidsrammer").should("be.visible");
    cy.contains("Intervjuvindu").should("not.exist");
    cy.contains("Intervjuperiode").should("be.visible");
    cy.contains("Daglig tidsrom").should("be.visible");
    cy.contains("Slik blir én standardblokk").should("not.exist");
    cy.contains("Intervjutider").should("be.visible");
  });

  it("keeps a block off after changing the pause and rendering again", () => {
    cy.contains("button", "Lagre oppsett")
      .should("have.length", 1)
      .parents(".sticky")
      .should("have.length", 1);
    cy.contains("button", "Lagre tidsrammer").should("not.exist");

    cy.get('input[aria-label^="Alle standardblokker for "]')
      .should("have.length.greaterThan", 0)
      .then(($checkboxes) => {
        cy.wrap($checkboxes.eq(0)).check({ force: true });
      });

    cy.get('[data-cy="pattern-block"][aria-pressed="true"]:visible')
      .should("have.length.greaterThan", 0)
      .then(($cells) => {
        const targetDate = $cells.eq(0).attr("data-date");
        const targetRow = $cells.eq(0).attr("data-row-id");
        const targetSelector = `[data-cy="pattern-block"][data-date="${targetDate}"][data-row-id="${targetRow}"]`;

        cy.get('[role="radiogroup"][aria-label="Pause mellom blokker"]')
          .find('input[type="radio"][value="60"]')
          .check({ force: true });
        cy.get(targetSelector)
          .click()
          .should("have.attr", "aria-pressed", "false");

        cy.get('[data-cy="pattern-block"][aria-pressed="true"]:visible')
          .should("have.length.greaterThan", 0)
          .then(($nextCells) => {
            cy.wrap($nextCells.eq(0)).click();
          });
        cy.get(targetSelector).should("have.attr", "aria-pressed", "false");
        cy.get(targetSelector)
          .click()
          .should("have.attr", "aria-pressed", "true");
      });
  });

  it("preserves an internal closed interview across grid-mode switches", () => {
    cy.contains("button", "Åpne alle standardblokker").click();
    cy.contains("button", "Finjuster enkelttider").click();

    cy.get('[data-cy="fine-slot"][aria-pressed="true"]:visible')
      .eq(1)
      .then(($cell) => {
        const date = $cell.attr("data-date");
        const minute = $cell.attr("data-minute");
        const targetSelector = `[data-cy="fine-slot"][data-date="${date}"][data-minute="${minute}"]`;
        cy.wrap($cell).click().should("have.attr", "aria-pressed", "false");

        cy.contains("button", "Standardblokker").click();
        cy.contains("button", "Finjuster enkelttider").click();
        cy.get(targetSelector).should("have.attr", "aria-pressed", "false");
      });
  });
});
