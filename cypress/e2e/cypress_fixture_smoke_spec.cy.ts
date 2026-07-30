describe("deterministic Cypress fixture", () => {
  it("authenticates through Django and exposes the pending scheduler foundation", () => {
    cy.login("webkom");
    cy.intercept("GET", "**/api/admin/admission/webkom-open/schedule/").as(
      "schedule",
    );
    cy.intercept("GET", "**/api/admin/admission/webkom-open/availability/").as(
      "availability",
    );

    cy.visit("/webkom-open/schedule", {
      onBeforeLoad(window) {
        window.localStorage.setItem("admissions.wizard.admin.v1", "1");
      },
    });

    cy.wait("@schedule").its("response.statusCode").should("eq", 200);
    cy.wait("@availability").its("response.statusCode").should("eq", 200);
    cy.get("[data-cy=foundation-tab-coverage]").should("contain.text", "1/2");
  });
});
