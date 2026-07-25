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

const existingAdmission = {
  pk: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  slug: "webkom-test",
  title: "Sommeropptak 2027",
  description: "",
  is_open: false,
  is_appliable: false,
  is_closed: false,
  open_from: "2027-03-01T10:00:00Z",
  public_deadline: "2027-03-08T10:00:00Z",
  closed_from: "2027-03-09T10:00:00Z",
  admin_groups: [groups[0]],
  groups: [groups[0]],
  userdata: {
    actor_id: "webkom-actor",
    has_application: false,
    is_privileged: true,
    is_admin: true,
    is_recruiter: true,
    committee_role: "leader",
    committee_groups: ["Webkom"],
    represented_groups: ["Webkom"],
  },
};

const visitEditor = () => {
  cy.intercept("GET", "**/api/manage/admission/", []).as("admissions");
  cy.login("webkom");
  cy.visit("/manage/create");
  cy.wait("@admissions");
};

const visitExistingEditor = () => {
  cy.intercept("GET", "**/api/manage/admission/", []).as("admissions");
  cy.intercept(
    "GET",
    "**/api/manage/admission/webkom-test/",
    existingAdmission,
  ).as("admission");
  cy.intercept("GET", "**/api/manage/group/", groups).as("groups");
  cy.login("webkom");
  cy.visit("/manage/webkom-test");
  cy.wait(["@admissions", "@admission", "@groups"]);
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

  it("clears the recruiting-group validation error when a group is added", () => {
    cy.intercept("GET", "**/api/manage/group/", groups);
    visitEditor();

    cy.get('button[type="submit"]').click();
    cy.get("#admission-groups-error").should(
      "contain",
      "Velg minst én gruppe som har opptak",
    );

    cy.get("#admission-groups").select(groups[0].pk);

    cy.get("#admission-groups-error").should("not.exist");
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

  it("uses the group name and input type when adding group-specific questions", () => {
    cy.intercept("GET", "**/api/manage/group/", groups);
    visitEditor();
    cy.get("#admission-groups").select(groups[0].pk);

    cy.contains("Telefonnummer innhentes alltid").should("be.visible");
    cy.contains(
      "Alle søkere blir bedt om telefonnummer, så du trenger ikke å legge til et eget spørsmål om det her.",
    ).should("be.visible");

    cy.contains("button", "Legg til spørsmål for komiteen").click();
    cy.contains("Spørsmål 1 for Webkom").should("be.visible");
    cy.contains("label", "Type")
      .next("select")
      .find('option[value="phoneinput"]')
      .should("not.exist");
    cy.contains("label", "Spørsmål")
      .next("input")
      .should("have.attr", "placeholder", "Hvilket trinn går du på?");
    cy.contains("label", "Plassholder")
      .next("input")
      .should("have.attr", "placeholder", "Skriv et kort svar");

    cy.contains("label", "Type").next("select").select("textarea");
    cy.contains("label", "Spørsmål")
      .next("input")
      .should("have.attr", "placeholder", "Fortell litt om deg selv");
    cy.contains("label", "Plassholder")
      .next("input")
      .should("have.attr", "placeholder", "Skriv et lengre svar");
  });

  it("discards unsaved changes without updating an existing admission", () => {
    cy.intercept("PATCH", "**/api/manage/admission/webkom-test/").as(
      "updateAdmission",
    );
    visitExistingEditor();

    cy.contains("button", "Lagre endringer").should("be.disabled");
    cy.get("#admission-title")
      .should("have.value", "Sommeropptak 2027")
      .clear()
      .type("Ulagret tittel");
    cy.get("#admission-description").type("Ulagret beskrivelse");
    cy.contains("Ulagrede endringer").should("be.visible");
    cy.contains("button", "Lagre endringer").should("not.be.disabled");

    cy.contains("button", "Forkast endringer").click();
    cy.contains(
      "Er du sikker? Alle ulagrede endringer i dette opptaket blir forkastet.",
    ).should("be.visible");
    cy.get("[role='dialog']")
      .should("have.attr", "aria-modal", "true")
      .within(() => {
        cy.contains("button", "Avbryt").should("be.focused");
      });
    cy.get("#admission-title").should("have.value", "Ulagret tittel");
    cy.get("#admission-description").should(
      "have.value",
      "Ulagret beskrivelse",
    );
    cy.contains("button", "Avbryt").click();
    cy.contains("Ulagrede endringer").should("be.visible");
    cy.contains("button", "Forkast endringer").should("be.focused");

    cy.contains("button", "Forkast endringer").click();
    cy.get("[role='dialog']").within(() => {
      cy.contains("button", "Forkast endringer").click();
    });

    cy.get("#admission-title").should("have.value", "Sommeropptak 2027");
    cy.get("#admission-description").should("have.value", "");
    cy.contains("Ulagrede endringer").should("not.exist");
    cy.contains("button", "Lagre endringer").should("be.disabled");
    cy.get("@updateAdmission.all").should("have.length", 0);
  });

  it("only offers discard for existing admissions", () => {
    cy.intercept("GET", "**/api/manage/group/", groups);
    visitEditor();

    cy.get("#admission-title").type("Ulagret opptak");

    cy.contains("button", "Forkast endringer").should("not.exist");
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
