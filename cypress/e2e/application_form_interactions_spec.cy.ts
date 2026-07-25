import { serializePriorityText } from "src/routes/ApplicationForm/priorityText";

const admission = {
  pk: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  slug: "ui-test",
  title: "Komitéopptak – UI-test",
  description: "",
  is_open: true,
  is_appliable: true,
  is_closed: false,
  open_from: "2027-03-01T10:00:00Z",
  public_deadline: "2027-03-08T10:00:00Z",
  closed_from: "2027-03-09T10:00:00Z",
  groups: [
    {
      pk: "11111111-1111-4111-8111-111111111111",
      name: "Webkom",
      description: "Webkom lager produkter for Abakus.",
      logo: "",
      response_label: "Fortell hva du vil lage.",
      detail_link: "",
      header_fields: [],
    },
    {
      pk: "22222222-2222-4222-8222-222222222222",
      name: "Band",
      description: "Band lager liv og røre.",
      logo: null,
      response_label: "Fortell om musikken du liker.",
      detail_link: "",
      header_fields: [],
    },
  ],
  userdata: {
    actor_id: "ui-test-actor",
    has_application: false,
    is_privileged: false,
    is_admin: false,
    is_recruiter: false,
    committee_role: null,
    committee_groups: [],
    represented_groups: [],
    application_view_mode: "none",
  },
};

describe("application form interactions", () => {
  beforeEach(() => {
    cy.intercept("GET", "**/api/admission/ui-test/", admission).as("admission");
    cy.intercept("GET", "**/api/admission/ui-test/application/mine/", {
      statusCode: 404,
      body: {},
    }).as("myApplication");
    cy.login("webkom");
  });

  it("keeps groups without logos visible and keeps ranking order stable", () => {
    cy.visit("/ui-test/velg-grupper");
    cy.wait("@admission");

    cy.contains('[role="checkbox"]', "Band").should("contain", "Band").click();
    cy.contains('[role="checkbox"]', "Webkom").click();
    cy.get('[role="checkbox"][aria-checked="true"]').should("have.length", 2);
    cy.get('[data-cy="group-logo-fallback"][data-group-name="Band"]')
      .should("be.visible")
      .and("contain", "B");

    cy.contains("button", "Gå videre").click();
    cy.location("pathname").should("eq", "/ui-test/min-soknad");
    cy.wait("@myApplication");
    cy.get('[data-cy="group-logo-fallback"][data-group-name="Band"]').should(
      "be.visible",
    );

    cy.get('[data-cy="priority-ranking-list"] > li')
      .eq(0)
      .should("contain.text", "Webkom");
    cy.get('button[aria-label="Flytt Band opp"]').click();
    cy.get('[data-cy="priority-ranking-list"] > li')
      .eq(0)
      .should("contain.text", "Band");

    cy.wait(800);
    cy.get('[data-cy="priority-ranking-list"] > li')
      .eq(0)
      .should("contain.text", "Band")
      .next()
      .should("contain.text", "Webkom");
  });
});

describe("priority text model", () => {
  it("does not invent a ranking for comments-only input", () => {
    expect(
      serializePriorityText(["Webkom", "Band"], "Only a note", false),
    ).to.eq("Only a note");
  });
});
