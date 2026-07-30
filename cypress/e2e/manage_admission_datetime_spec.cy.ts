import { DateTime } from "luxon";
import type { Admission } from "../../frontend/src/types";
import { createDefaultAdmissionDates } from "../../frontend/src/routes/ManageAdmissions/admissionDateDefaults";

const groups = [
  {
    pk: "11111111-1111-4111-8111-111111111111",
    name: "Webkom",
    description: "",
    logo: "",
    response_label: "",
    detail_link: "",
  },
  {
    pk: "22222222-2222-4222-8222-222222222222",
    name: "Fagkom",
    description: "",
    logo: "",
    response_label: "",
    detail_link: "",
  },
];

const navigateToDate = (fieldId: string, date: string) => {
  const [targetYear, targetMonth] = date.split("-").map(Number);
  cy.get(`#${fieldId}`).click();
  cy.get(`[data-cy="date-dialog-${fieldId}"]`)
    .invoke("attr", "data-displayed-month")
    .then((displayedMonth) => {
      const [year, month] = String(displayedMonth).split("-").map(Number);
      const offset = (targetYear - year) * 12 + targetMonth - month;
      const label = offset >= 0 ? "Neste måned" : "Forrige måned";
      Cypress._.times(Math.abs(offset), () => {
        cy.get(`[data-cy="date-dialog-${fieldId}"]`)
          .find(`button[aria-label="${label}"]`)
          .click();
      });
    });
  cy.get(`[data-cy="date-dialog-${fieldId}"]`)
    .find(`[data-calendar-date="${date}"]`)
    .click();
};

const setAdmissionDateTime = (fieldId: string, value: string) => {
  navigateToDate(fieldId, value.slice(0, 10));
  cy.get(`#${fieldId}-time`).clear().type(value.slice(11, 16)).blur();
};

const managedAdmission: Admission = {
  pk: "33333333-3333-4333-8333-333333333333",
  slug: "hostopptak-2026",
  title: "Høstopptak 2026",
  description: "Et opptak med lagrede norske klokkeslett.",
  is_open: false,
  is_appliable: false,
  is_closed: false,
  open_from: "2026-10-24T22:30:00+02:00",
  public_deadline: "2026-10-25T03:30:00+01:00",
  closed_from: "2026-10-26T23:59:00+01:00",
  admin_groups: [groups[0]],
  groups: [groups[0], groups[1]],
  userdata: {
    actor_id: "test-actor",
    has_application: false,
    is_privileged: true,
    is_admin: true,
    is_recruiter: true,
    committee_role: "leader",
    committee_groups: [groups[0].pk],
    represented_groups: [groups[0].pk],
  },
};

describe("create admission lifecycle dates", () => {
  beforeEach(() => {
    cy.intercept("GET", "**/api/manage/admission/", []).as("admissions");
    cy.intercept("GET", "**/api/manage/group/", groups).as("groups");
    cy.login("webkom");
    cy.visit("/manage/create");
    cy.wait(["@admissions", "@groups"]);
  });

  it("renders ordered Norway-local defaults with separate controls", () => {
    cy.contains(
      "Alle tidspunkt vises og tolkes i norsk tid (Europe/Oslo).",
    ).should("be.visible");
    cy.get('input[type="datetime-local"]').should("not.exist");
    cy.get('[data-cy^="datetime-control-"]').should("have.length", 3);
    cy.get("#open_from")
      .should("not.contain", "Ikke valgt")
      .and("have.attr", "aria-haspopup", "dialog");
    cy.get("#open_from-time").should("have.value", "12:00");
    cy.get("#public_deadline").should("not.contain", "Ikke valgt");
    cy.get("#public_deadline-time").should("have.value", "23:59");
    cy.get("#closed_from").should("not.contain", "Ikke valgt");
    cy.get("#closed_from-time").should("have.value", "23:59");
  });

  it("does not submit an incomplete lifecycle field", () => {
    cy.get("#public_deadline-time").clear().blur();
    cy.get('[data-cy="datetime-control-public_deadline"]')
      .parent()
      .find('[role="alert"]')
      .should("contain", "Søknadsfrist er påkrevd");
    cy.contains("button", "Opprett opptak").should("be.disabled");
  });

  it("shows the dependent error when a later opening invalidates the deadline", () => {
    const invalidOpening = DateTime.fromISO(
      createDefaultAdmissionDates().public_deadline,
    )
      .plus({ days: 1 })
      .set({ hour: 12, minute: 0 })
      .toFormat("yyyy-MM-dd'T'HH:mm");

    navigateToDate("open_from", invalidOpening.slice(0, 10));

    cy.get("#public_deadline-error")
      .should("be.visible")
      .and("contain", "Søknadsfristen må være etter åpningen");
    cy.contains("button", "Opprett opptak").should("be.disabled");
  });

  it("revalidates a displayed deadline when the opening minimum changes", () => {
    const defaults = createDefaultAdmissionDates();
    const openingDate = defaults.open_from.slice(0, 10);

    navigateToDate("public_deadline", openingDate);
    cy.get("#public_deadline-time").clear().type("1100").blur();
    cy.get("#public_deadline-error")
      .should("be.visible")
      .and("contain", "Tidspunktet må være etter");
    cy.contains("button", "Opprett opptak").should("be.disabled");

    cy.get("#open_from-time").clear().type("1000").blur();

    cy.get("#public_deadline-time").should("have.value", "11:00");
    cy.get("#public_deadline-error").should("not.exist");
    cy.contains("button", "Opprett opptak").should("not.be.disabled");
  });

  it("serializes explicitly chosen Norwegian lifecycle times with their ISO offsets", () => {
    cy.intercept("POST", "**/api/manage/admission/", (request) => {
      expect(request.body.open_from).to.equal("2026-07-20T12:00:00.000+02:00");
      expect(request.body.public_deadline).to.equal(
        "2026-07-26T23:59:00.000+02:00",
      );
      expect(request.body.closed_from).to.equal(
        "2026-08-02T23:59:00.000+02:00",
      );
      request.reply({ statusCode: 201, body: { slug: "komiteopptak-2026" } });
    }).as("createAdmission");

    cy.get('input[name="title"]').type("Komiteopptak 2026");
    cy.get('input[name="slug"]').type("komiteopptak-2026");
    setAdmissionDateTime("open_from", "2026-07-20T12:00");
    setAdmissionDateTime("public_deadline", "2026-07-26T23:59");
    setAdmissionDateTime("closed_from", "2026-08-02T23:59");
    cy.get("select").eq(0).select(groups[0].name);
    cy.get("select").eq(1).select(groups[1].name);
    cy.contains("button", "Opprett opptak").click();
    cy.wait("@createAdmission");
  });
});

describe("edit admission lifecycle dates", () => {
  beforeEach(() => {
    cy.intercept("GET", "**/api/manage/admission/", [managedAdmission]).as(
      "admissions",
    );
    cy.intercept(
      "GET",
      `**/api/manage/admission/${managedAdmission.slug}/`,
      managedAdmission,
    ).as("admission");
    cy.intercept("GET", "**/api/manage/group/", groups).as("groups");
    cy.login("webkom");
    cy.visit(`/manage/${managedAdmission.slug}`);
    cy.wait(["@admissions", "@admission", "@groups"]);
  });

  it("hydrates offset timestamps as Norwegian wall times and updates ordered lifecycle values", () => {
    cy.contains(
      "Alle tidspunkt vises og tolkes i norsk tid (Europe/Oslo).",
    ).should("be.visible");
    cy.contains("Redigerer: Høstopptak 2026").should("be.visible");
    cy.get("#open_from").should("contain", "24. oktober 2026");
    cy.get("#open_from-time").should("have.value", "22:30");
    cy.get("#public_deadline").should("contain", "25. oktober 2026");
    cy.get("#public_deadline-time").should("have.value", "03:30");
    cy.get("#closed_from").should("contain", "26. oktober 2026");
    cy.get("#closed_from-time").should("have.value", "23:59");

    setAdmissionDateTime("open_from", "2026-10-28T09:00");
    cy.get("#public_deadline-error")
      .should("be.visible")
      .and("contain", "Søknadsfristen må være etter åpningen");
    cy.contains("button", "Lagre endringer").should("be.disabled");

    cy.intercept(
      "PATCH",
      `**/api/manage/admission/${managedAdmission.slug}/`,
      (request) => {
        expect(request.body.open_from).to.equal(
          "2026-10-28T09:00:00.000+01:00",
        );
        expect(request.body.public_deadline).to.equal(
          "2026-10-29T10:00:00.000+01:00",
        );
        expect(request.body.closed_from).to.equal(
          "2026-10-30T23:59:00.000+01:00",
        );
        request.reply({
          statusCode: 200,
          body: { ...request.body, created_by: "test-actor" },
        });
      },
    ).as("updateAdmission");

    setAdmissionDateTime("public_deadline", "2026-10-29T10:00");
    setAdmissionDateTime("closed_from", "2026-10-30T23:59");
    cy.contains("button", "Lagre endringer").click();
    cy.wait("@updateAdmission");
  });
});
