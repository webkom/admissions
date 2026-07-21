const groups = [
  {
    pk: "11111111-1111-4111-8111-111111111111",
    name: "Webkom",
    description: "",
    logo: "",
    response_label: "Søknadstekst",
    detail_link: "",
  },
  {
    pk: "22222222-2222-4222-8222-222222222222",
    name: "Fagkom",
    description: "",
    logo: "",
    response_label: "Søknadstekst",
    detail_link: "",
  },
];

const visitEditor = () => {
  cy.intercept("GET", "**/api/manage/admission/", []).as("admissions");
  cy.login("webkom");
  cy.visit("/manage/create");
  cy.wait("@admissions");
};

const fillRequiredFields = () => {
  cy.get("#admission-title").type("Komiteopptak 2027");
  cy.get("#open_from").type("2027-03-01T10:00");
  cy.get("#public_deadline").type("2027-03-08T10:00");
  cy.get("#closed_from").type("2027-03-09T10:00");
  cy.get("#admin-groups").select(groups[0].pk);
  cy.get("#admission-groups").select(groups[1].pk);
};

describe("manage admission editor", () => {
  it("lists validation errors and moves focus to a selected field", () => {
    cy.intercept("GET", "**/api/manage/group/", groups);
    visitEditor();

    cy.get('button[type="submit"]').click();

    cy.get("#admission-error-summary")
      .should("contain", "Tittel: Tittel er påkrevd")
      .and("contain", "Ansvarlige opptaksgrupper: Velg minst én admin-gruppe");
    cy.get("#admission-error-summary").contains("a", "Søknadsfrist:").click();
    cy.focused().should("have.id", "public_deadline");
  });

  it("maps a duplicate slug response to the field and error summary", () => {
    cy.intercept("GET", "**/api/manage/group/", groups);
    cy.intercept("POST", "**/api/manage/admission/", {
      statusCode: 400,
      body: { slug: ["Et opptak med denne sluggen finnes allerede."] },
    }).as("createAdmission");
    visitEditor();
    fillRequiredFields();

    cy.get('button[type="submit"]').click();
    cy.wait("@createAdmission");

    cy.get("#admission-error-summary").should(
      "contain",
      "Slug: Et opptak med denne sluggen finnes allerede.",
    );
    cy.focused().should("have.id", "admission-slug");
    cy.get("#admission-slug").clear().type("komiteopptak-2027-ny");
    cy.get("#admission-error-summary").should("not.exist");
  });

  it("shows a safe top-level message for an unexpected server failure", () => {
    cy.intercept("GET", "**/api/manage/group/", groups);
    cy.intercept("POST", "**/api/manage/admission/", {
      statusCode: 503,
      body: { detail: "database host admissions-primary.internal unavailable" },
    }).as("createAdmission");
    visitEditor();
    fillRequiredFields();

    cy.get('button[type="submit"]').click();
    cy.wait("@createAdmission");

    cy.get("#admission-error-summary")
      .should("contain", "Opptaket kunne ikke lagres. Prøv igjen.")
      .and("not.contain", "admissions-primary.internal")
      .should("be.focused");
  });

  it("retries group loading without reloading the page", () => {
    let requestCount = 0;
    cy.intercept("GET", "**/api/manage/group/", (request) => {
      requestCount += 1;
      request.reply(
        requestCount === 1
          ? { statusCode: 503, body: {} }
          : { statusCode: 200, body: groups },
      );
    }).as("groups");
    visitEditor();
    cy.wait("@groups");

    cy.contains("Gruppene kunne ikke lastes.").should("be.visible");
    cy.contains("button", "Prøv igjen").first().click();
    cy.wait("@groups");

    cy.contains("Gruppene kunne ikke lastes.").should("not.exist");
    cy.get("#admin-groups").find("option").should("have.length", 3);
  });

  it("explains admission groups in the normal flow without a tooltip", () => {
    cy.intercept("GET", "**/api/manage/group/", groups);
    visitEditor();

    cy.contains("Opptaksgrupper og tilgang").should("be.visible");
    cy.contains(
      "Den styrer tilgang til søkere og gruppespesifikke spørsmål",
    ).should("be.visible");
    cy.contains("Opptaksgrupper som rekrutterer").should("be.visible");
    cy.get("#admission-groups").should("contain", "Legg til opptaksgruppe");
  });

  it("protects unsaved changes during internal navigation", () => {
    cy.intercept("GET", "**/api/manage/group/", groups);
    visitEditor();
    cy.get("#admission-title").type("Ulagret opptak");
    cy.window().then((window) => {
      cy.stub(window, "confirm").returns(false).as("confirmNavigation");
    });

    cy.contains("a", "Til forsiden").click();

    cy.get("@confirmNavigation").should("have.been.calledOnce");
    cy.location("pathname").should("equal", "/manage/create");
  });
});
