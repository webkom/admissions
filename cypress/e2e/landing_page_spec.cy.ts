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

  it("purges sensitive browser state before landing-page logout completes", () => {
    const actorKey = "admissions.auth.actor.v1";
    const templateKey =
      "admissions:webkom-open:actor:test-actor:interview-outreach-template";
    cy.login("webkom");
    cy.intercept("GET", "/logout/", {
      statusCode: 200,
      body: "",
    }).as("logout");
    cy.visit("/", {
      onBeforeLoad(window) {
        window.localStorage.setItem(
          actorKey,
          JSON.stringify({ actorId: "test-actor" }),
        );
        window.localStorage.setItem(templateKey, "Candidate phone 12345678");
      },
    });

    cy.contains("a", "Logg ut").click();

    cy.wait("@logout");
    cy.location("pathname").should("eq", "/");
    cy.window().then((window) => {
      expect(window.localStorage.getItem(templateKey)).to.equal(null);
    });
  });
});
