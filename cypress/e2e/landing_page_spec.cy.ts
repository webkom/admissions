describe("landing page spec", () => {
  before(() => {
    cy.clearDb();
  });

  it("successfully loads", () => {
    cy.visit("/");
    cy.contains("Opptak");
    cy.contains("Ingen åpne opptak for øyeblikket");
    cy.contains("Logg inn");
  });
});
