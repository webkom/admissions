const groups = [
  {
    pk: "11111111-1111-4111-8111-111111111111",
    name: "Webkom",
    description:
      "Webkom utvikler og drifter de digitale tjenestene til Abakus.",
    logo: "",
    response_label: "Fortell hva du ønsker å lære og lage sammen med Webkom.",
    detail_link: "",
  },
  {
    pk: "22222222-2222-4222-8222-222222222222",
    name: "Fagkom",
    description:
      "Fagkom arrangerer kurs og skaper faglige møteplasser for studentene.",
    logo: "",
    response_label:
      "Fortell hvilke faglige aktiviteter du har lyst til å bidra til.",
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
    application_view_mode: "admin_full",
  },
};

const visitEditor = () => {
  cy.intercept("GET", "**/api/manage/admission/", []).as("admissions");
  cy.login("webkom");
  cy.visit("/manage/create");
  cy.wait("@admissions");
};

const visitExistingEditor = (admission = existingAdmission) => {
  cy.intercept("GET", "**/api/manage/admission/", []).as("admissions");
  cy.intercept("GET", "**/api/manage/admission/webkom-test/", admission).as(
    "admission",
  );
  cy.intercept("GET", "**/api/manage/group/", groups).as("groups");
  cy.login("webkom");
  cy.visit("/manage/webkom-test");
  cy.wait(["@admissions", "@admission", "@groups"]);
};

const selectGroup = (fieldId: string, groupName: string) => {
  cy.get(`#${fieldId}`).then(($trigger) => {
    if ($trigger.attr("aria-expanded") !== "true") {
      cy.wrap($trigger).click();
    }
  });
  cy.get(`#${fieldId}-listbox`).contains('[role="option"]', groupName).click();
};

const setAdmissionDateTime = (fieldId: string, value: string) => {
  const targetDate = value.slice(0, 10);
  const [targetYear, targetMonth] = targetDate.split("-").map(Number);
  cy.get(`#${fieldId}`).click();
  cy.get(`[data-cy="date-dialog-${fieldId}"]`)
    .invoke("attr", "data-displayed-month")
    .then((displayedMonth) => {
      const [displayedYear, displayedMonthNumber] = String(displayedMonth)
        .split("-")
        .map(Number);
      const monthOffset =
        (targetYear - displayedYear) * 12 + targetMonth - displayedMonthNumber;
      const navigationLabel =
        monthOffset >= 0 ? "Neste måned" : "Forrige måned";
      Cypress._.times(Math.abs(monthOffset), () => {
        cy.get(`[data-cy="date-dialog-${fieldId}"]`)
          .find(`button[aria-label="${navigationLabel}"]`)
          .click();
      });
    });
  cy.get(`[data-cy="date-dialog-${fieldId}"]`)
    .find(`[data-calendar-date="${targetDate}"]`)
    .click();
  cy.get(`#${fieldId}-time`).clear().type(value.slice(11, 16)).blur();
};

const fillRequiredFields = () => {
  cy.get("#admission-title").type("Komiteopptak 2027");
  setAdmissionDateTime("open_from", "2027-03-01T10:00");
  setAdmissionDateTime("public_deadline", "2027-03-08T10:00");
  setAdmissionDateTime("closed_from", "2027-03-09T10:00");
  selectGroup("admin-groups", groups[0].name);
  selectGroup("admission-groups", groups[1].name);
};

describe("manage admission editor", () => {
  it("lists validation errors and moves focus to a selected field", () => {
    cy.intercept("GET", "**/api/manage/group/", groups);
    visitEditor();

    cy.get('button[type="submit"]').should("be.disabled");
    selectGroup("admission-groups", groups[0].name);
    cy.get('button[type="submit"]').click();

    cy.get("#admission-error-summary")
      .should("contain", "Tittel: Tittel er påkrevd")
      .and("contain", "Admin-grupper: Velg minst én admin-gruppe");
    cy.get("#admission-error-summary").contains("a", "Søknadsfrist:").click();
    cy.focused().should("have.id", "public_deadline");
  });

  it("uses the custom date-time picker for admission lifecycle dates", () => {
    visitExistingEditor();

    cy.contains("Når søknadsperioden skal starte.").should("be.visible");
    cy.get("#open_from")
      .should("have.attr", "aria-haspopup", "dialog")
      .and("not.have.attr", "type", "datetime-local")
      .click();
    cy.get('[data-cy="date-dialog-open_from"]')
      .should("be.visible")
      .and("not.contain", "Opptaket åpner")
      .and("not.contain", "Norsk tid");
    cy.get('[data-cy="date-dialog-open_from"]').type("{esc}");
    cy.get("#open_from").should("be.focused");
  });

  it("disables submission until an admissions group is selected", () => {
    cy.intercept("GET", "**/api/manage/group/", groups);
    visitEditor();

    cy.get("#admission-title").type("Komiteopptak 2027");
    setAdmissionDateTime("open_from", "2027-03-01T10:00");
    setAdmissionDateTime("public_deadline", "2027-03-08T10:00");
    setAdmissionDateTime("closed_from", "2027-03-09T10:00");
    selectGroup("admin-groups", groups[0].name);

    cy.get('button[type="submit"]').should("be.disabled");
    selectGroup("admission-groups", groups[0].name);
    cy.get('button[type="submit"]').should("not.be.disabled");
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
    cy.get("#admin-groups").click();
    cy.get('[role="listbox"]').within(() => {
      cy.get('[role="option"]').should("have.length", 2);
    });
  });

  it("explains admission groups in the normal flow without a tooltip", () => {
    cy.intercept("GET", "**/api/manage/group/", groups);
    visitEditor();

    cy.contains("Opptaksgrupper og tilgang").should("be.visible");
    cy.contains("Den styrer tilgang til søkerne").should("be.visible");
    cy.contains("Grupper som har opptak").should("be.visible");
    cy.get("#admission-groups").should("contain", "Legg til gruppe");
  });

  it("edits the complete committee profile in one master-detail workspace", () => {
    cy.intercept("GET", "**/api/manage/group/", groups);
    cy.intercept("POST", "**/api/manage/admission/", (request) => {
      expect(request.body.group_content[groups[0].pk]).to.deep.equal({
        committee_info:
          "Webkom lager produkter som gjør studiehverdagen enklere.",
        application_guidance:
          "Fortell om noe du er nysgjerrig på å lære eller bygge.",
        interview_description:
          "Intervjuet er en uformell samtale om motivasjon og samarbeid.",
      });
      expect(request.body.group_content[groups[1].pk]).to.deep.equal({
        committee_info: null,
        application_guidance: null,
        interview_description: null,
      });
      expect(request.body.group_questions).to.deep.equal({});
      request.reply({
        statusCode: 201,
        body: { slug: "komiteopptak-2027" },
      });
    }).as("createAdmission");
    visitEditor();
    fillRequiredFields();
    selectGroup("admission-groups", groups[0].name);

    cy.contains("Gruppespesifikke spørsmål").should("not.exist");
    cy.contains("button", "Legg til spørsmål for komiteen").should("not.exist");
    cy.contains("Komiteer").should("be.visible");
    cy.get('button[data-group-name="Webkom"]').click();
    cy.get(`#committee-content-${groups[0].pk}-committee_info`)
      .should("have.value", groups[0].description)
      .clear()
      .type("Webkom lager produkter som gjør studiehverdagen enklere.");
    cy.get('[data-cy="committee-content-preview"]')
      .should("be.visible")
      .and(
        "contain",
        "Webkom lager produkter som gjør studiehverdagen enklere.",
      );
    cy.get(`#committee-content-${groups[0].pk}-application_guidance`)
      .should("have.value", groups[0].response_label)
      .clear()
      .type("Fortell om noe du er nysgjerrig på å lære eller bygge.");
    cy.get('[data-cy="committee-content-preview"]')
      .should("be.visible")
      .and("contain", "Fortell om noe du er nysgjerrig på å lære eller bygge.");
    cy.get(`#committee-content-${groups[0].pk}-interview_description`)
      .clear()
      .type("Intervjuet er en uformell samtale om motivasjon og samarbeid.");

    cy.get('[aria-label="Valgte grupper"]')
      .eq(1)
      .find('button[aria-label="Fjern Webkom"]')
      .click();
    selectGroup("admission-groups", groups[0].name);
    cy.get('button[data-group-name="Webkom"]').click();
    cy.get(`#committee-content-${groups[0].pk}-committee_info`).should(
      "have.value",
      "Webkom lager produkter som gjør studiehverdagen enklere.",
    );

    cy.get('button[type="submit"]').click();
    cy.wait("@createAdmission");
  });

  it("keeps global committee fallback content inherited on unrelated edits", () => {
    cy.intercept("PATCH", "**/api/manage/admission/webkom-test/", (request) => {
      expect(request.body.group_questions).to.deep.equal({});
      expect(request.body.group_content[groups[0].pk]).to.deep.equal({
        committee_info: null,
        application_guidance: null,
        interview_description: null,
      });
      request.reply({ statusCode: 200, body: {} });
    }).as("updateAdmission");
    visitExistingEditor();

    cy.get("#admission-title").clear().type("Sommeropptak 2027 oppdatert");
    cy.get('button[type="submit"]').click();
    cy.wait("@updateAdmission");
  });

  it("can restore a committee override to the shared global text", () => {
    const customizedAdmission = {
      ...existingAdmission,
      groups: [
        {
          ...groups[0],
          committee_info: "Tilpasset Webkom-info for dette opptaket.",
          application_guidance: null,
          interview_description: null,
        },
      ],
    };
    cy.intercept("PATCH", "**/api/manage/admission/webkom-test/", (request) => {
      expect(request.body.group_content[groups[0].pk]).to.deep.equal({
        committee_info: null,
        application_guidance: null,
        interview_description: null,
      });
      request.reply({ statusCode: 200, body: {} });
    }).as("updateAdmission");
    visitExistingEditor(customizedAdmission);

    cy.get(`#committee-content-${groups[0].pk}-committee_info`).should(
      "have.value",
      "Tilpasset Webkom-info for dette opptaket.",
    );
    cy.contains("button", "Bruk felles standardtekst").click();
    cy.get(`#committee-content-${groups[0].pk}-committee_info`).should(
      "have.value",
      groups[0].description,
    );
    cy.get("#admission-title").clear().type("Sommeropptak med standardtekst");
    cy.get('button[type="submit"]').click();
    cy.wait("@updateAdmission");
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
