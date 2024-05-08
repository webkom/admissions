describe("landing page spec", () => {
  it("successfully loads when not logged in", () => {
    cy.logout();
    cy.visit("/");
    cy.contains("Opptak");
    cy.contains("Logg inn");
  });

  it("successfully loads when logged in", () => {
    cy.login("webkom");
    cy.visit("/");
    cy.contains("Opptak");
    cy.contains("Logg inn").should("not.exist");
  });
});
