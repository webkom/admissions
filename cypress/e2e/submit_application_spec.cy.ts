describe("submit application spec", () => {
  it("successfully apply to one group", () => {
    cy.login("webkom");
    cy.visit("/");
    cy.contains("Komitéopptak")
      .parent()
      .parent()
      .parent()
      .contains("Gå til søknad")
      .click();
    cy.contains("Velg komité").click();
    cy.contains("Gå videre").click();
    cy.get("input[name='phoneNumber']").type("12345678");
    cy.contains("Søknadstekst").type("Hei jeg vil gjerne søke");
    cy.contains("Send inn søknad").click();
    cy.contains("Vi har mottatt søknaden din!").should("exist");
    cy.contains("Slett søknad").click();
    cy.contains("Er du sikker på at du vil slette søknaden din?")
      .parent()
      .contains("Ja")
      .click();
  });
});
