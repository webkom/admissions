describe("submit application spec", () => {
  it("successfully apply to one group", () => {
    cy.login("webkom");
    // The spec submits and then deletes, so a run that fails in between leaves
    // an application behind and every later run lands on the receipt instead of
    // the form. Start from a known state rather than depending on the last run
    // having succeeded.
    cy.visit("/");
    cy.contains("Webkomopptak – åpent")
      .parent()
      .parent()
      .parent()
      .contains("Gå til søknad")
      .click();
    // webkom-open carries 21 committees in the fixtures, so the landing page
    // sends applicants to choose before writing. The spec predates that and
    // still expected the single-committee shortcut.
    cy.location("pathname").should("eq", "/webkom-open/velg-grupper");
    cy.get('[role="checkbox"]').first().click();
    cy.contains("button", "Gå videre").click();

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
    cy.contains("Skriv din søknad og send inn!").should("be.visible");
  });
});
