describe("admin schedule configuration toggles", () => {
  beforeEach(() => {
    cy.viewport(1440, 900);
    cy.login("webkom");
    cy.visit("/webkom-apent/schedule", {
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
    cy.contains("Forhåndsvisning").should("be.visible");
    cy.contains("Aktive intervjublokker").should("be.visible");
  });

  it("keeps a block off after changing the pause and rendering again", () => {
    cy.contains("button", "Lagre oppsett")
      .should("have.length", 1)
      .parents(".sticky")
      .should("have.length", 1);
    cy.contains("button", "Lagre tidsrammer").should("not.exist");

    cy.get('input[aria-label^="Alle tidsluker for "]')
      .should("have.length.greaterThan", 0)
      .then(($checkboxes) => {
        cy.wrap($checkboxes.eq(0)).check({ force: true });
      });

    cy.get('[role="button"][aria-pressed="true"]:visible')
      .should("have.length.greaterThan", 0)
      .then(($cells) => {
        const targetLabel = $cells.eq(0).attr("aria-label");
        expect(targetLabel).to.be.a("string");

        cy.get('button[aria-label="Pause mellom blokker"]').click();
        cy.get('[role="option"]').contains("60 min").click();
        cy.get(`[role="button"][aria-label="${targetLabel}"]:visible`).click();
        cy.get(`[role="button"][aria-label="${targetLabel}"]:visible`).should(
          "have.attr",
          "aria-pressed",
          "false",
        );

        cy.get('[role="button"][aria-pressed="true"]:visible')
          .should("have.length.greaterThan", 0)
          .then(($nextCells) => {
            cy.wrap($nextCells.eq(0)).click();
          });
        cy.get(`[role="button"][aria-label="${targetLabel}"]:visible`).should(
          "have.attr",
          "aria-pressed",
          "false",
        );
      });
  });
});
