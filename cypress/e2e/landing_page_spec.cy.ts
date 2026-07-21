describe("landing page spec", () => {
  it("links a single-group admin card to its group ID", () => {
    const groupId = "11111111-1111-4111-8111-111111111111";
    cy.intercept("GET", "**/api/admission/", {
      body: [
        {
          pk: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          slug: "webkom-open",
          title: "Webkomopptak",
          description: "",
          is_open: true,
          is_appliable: true,
          is_closed: false,
          open_from: "2026-07-01T10:00:00Z",
          public_deadline: "2026-07-20T10:00:00Z",
          closed_from: "2026-07-21T10:00:00Z",
          groups: [groupId],
          userdata: {
            has_application: false,
            is_privileged: true,
            is_admin: false,
            is_recruiter: true,
            committee_role: "recruiting",
            committee_groups: ["Webkom"],
            represented_groups: ["Webkom"],
          },
        },
      ],
    }).as("admissions");

    cy.login("webkom");
    cy.visit("/");
    cy.wait("@admissions");
    cy.contains("button", "Admin panel").click();
    cy.location("pathname").should("eq", "/webkom-open/admin/");
    cy.location("search").should("eq", `?group=${groupId}`);
  });

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
