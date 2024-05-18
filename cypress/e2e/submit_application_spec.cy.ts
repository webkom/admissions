describe("submit application spec", () => {
  it("successfully apply to one group", () => {
    cy.login("webkom");
    cy.visit("/");
    cy.contains("Gå til søknad").click();
    cy.contains("Velg komité").click();
    cy.contains("Gå videre").click();
    cy.get("input[name='phoneNumber']").type("12345678");
    cy.contains("Søknadstekst").type("Hei jeg vil gjerne søke");
    cy.contains("Send inn søknad").click();
    cy.contains("Vi har mottatt søknaden din!").should("exist");
  });
});
