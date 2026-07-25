describe("submit application spec", () => {
  it("successfully apply to one group", () => {
    cy.login("webkom");
    cy.visit("/");
    cy.contains("Webkomopptak – åpent")
      .parent()
      .parent()
      .parent()
      .contains("Gå til søknad")
      .click();
    cy.location("pathname").should("eq", "/webkom-open/min-soknad");
    cy.contains("Skriv din søknad og send inn!").should("be.visible");
    cy.get("input[name='phoneNumber']").type("12345678");
    cy.contains("Søknadstekst").type("Hei jeg vil gjerne søke");
    cy.contains("Send inn søknad").click();
    cy.contains("h1", "Søknad sendt!").should("be.visible");
    cy.contains("Slett søknad").click();
    cy.get("[role='dialog']")
      .should("have.attr", "aria-modal", "true")
      .within(() => {
        cy.contains("Er du sikker på at du vil slette søknaden din?").should(
          "be.visible",
        );
        cy.contains("button", "Bekreft").click();
      });
    cy.location("pathname").should("eq", "/");
  });
});
