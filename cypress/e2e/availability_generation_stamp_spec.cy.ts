/**
 * The editor has to stamp every save with the availability generation it last
 * saw. Losing that stamp is invisible in the UI - the save simply comes back
 * 400 with "Dette feltet er påkrevd når tilgjengelighet lagres." - so it is
 * asserted here on the request body itself.
 */
const harness = (query = "") =>
  `http://localhost:5001/static/cypress/fixtures/availability-editor.html${query}`;

const stubSave = () =>
  cy
    .intercept("POST", "**/availability/", (req) => {
      req.reply({
        statusCode: 200,
        body: {
          user_id: "me",
          slots: req.body.slots ?? [],
          discouraged_slots: req.body.discouraged_slots ?? [],
          availability_generation: req.body.expected_availability_generation,
        },
      });
    })
    .as("save");

describe("availability generation stamp", () => {
  it("sends the generation it was handed, from a first-time empty answer", () => {
    stubSave();
    cy.visit(harness("?generation=6"));
    cy.get("[data-cy=availability-editor-harness]").should("exist");
    cy.get("[data-cy=editor-selected]").should("have.text", "none");

    cy.get("[data-cy=save-availability]").click();
    cy.wait("@save")
      .its("request.body.expected_availability_generation")
      .should("equal", 6);
    cy.get("[data-cy=editor-status]").should(
      "contain",
      "Tilgjengelighet lagret.",
    );
  });

  it("adopts the saved answer and still stamps the generation", () => {
    stubSave();
    cy.visit(harness("?generation=4&saved=2026-08-26|540"));
    cy.get("[data-cy=editor-selected]").should("have.text", "2026-08-26|540");

    cy.get("[data-cy=save-availability]").click();
    cy.wait("@save")
      .its("request.body.expected_availability_generation")
      .should("equal", 4);
  });
});
