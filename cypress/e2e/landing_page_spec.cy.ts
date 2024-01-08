describe("landing page spec", () => {
  it("successfully loads", () => {
    cy.visit("/");
    cy.contains("Opptak");
    cy.contains("Logg inn");
  });
});
