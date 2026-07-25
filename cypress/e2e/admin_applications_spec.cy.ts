const webkom = {
  pk: "11111111-1111-4111-8111-111111111111",
  name: "Webkom",
  description: "",
  logo: "",
  response_label: "Hvorfor vil du søke Webkom?",
  detail_link: "",
  header_fields: [
    {
      id: "experience",
      type: "textarea",
      title: "Relevant erfaring",
      label: "",
      placeholder: "",
      required: false,
    },
  ],
};

const fagkom = {
  pk: "22222222-2222-4222-8222-222222222222",
  name: "Fagkom",
  description: "",
  logo: "",
  response_label: "Hvorfor vil du søke Fagkom?",
  detail_link: "",
  header_fields: [],
};

const admission = {
  pk: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  slug: "webkom-test",
  title: "Sommeropptak 2026",
  description: "",
  is_open: true,
  is_appliable: true,
  is_closed: false,
  open_from: "2026-07-01T10:00:00Z",
  public_deadline: "2026-07-20T10:00:00Z",
  closed_from: "2026-07-21T10:00:00Z",
  admin_groups: [webkom],
  groups: [webkom, fagkom],
  userdata: {
    actor_id: "webkom-actor",
    has_application: false,
    is_privileged: true,
    is_admin: true,
    is_recruiter: true,
    committee_role: "leader",
    committee_groups: ["Webkom"],
    represented_groups: ["Webkom", "Fagkom"],
    application_view_mode: "admin_full",
  },
};

const applications = [
  {
    pk: "aaaaaaaa-0000-4000-8000-000000000001",
    application_view_mode: "admin_full",
    user: {
      username: "ida",
      full_name: "Ida Nordmann",
      profile_picture: "",
      phone_number: "",
      email: "ida@example.test",
    },
    created_at: "2026-07-15T10:00:00Z",
    updated_at: "2026-07-16T09:37:00Z",
    applied_within_deadline: true,
    phone_number: "900 00 001",
    interview_status: "not_invited",
    interview_status_updated_at: "2026-07-16T09:37:00Z",
    interview_status_updated_by: "webkom",
    group_applications: [
      {
        group: webkom,
        text: "Jeg trives med å lære gjennom å lage produkter.",
        header_fields_response: { experience: "Et lite React-prosjekt." },
      },
      {
        group: fagkom,
        text: "Jeg liker å forklare vanskelige konsepter.",
        header_fields_response: {},
      },
    ],
  },
  {
    pk: "aaaaaaaa-0000-4000-8000-000000000002",
    application_view_mode: "admin_full",
    user: {
      username: "olav",
      full_name: "Olav Hansen",
      profile_picture: "",
      phone_number: "",
      email: "olav@example.test",
    },
    created_at: "2026-07-15T10:05:00Z",
    updated_at: "2026-07-15T10:05:00Z",
    applied_within_deadline: true,
    phone_number: "900 00 002",
    interview_status: "invited",
    interview_status_updated_at: "2026-07-15T10:05:00Z",
    interview_status_updated_by: "webkom",
    group_applications: [
      {
        group: webkom,
        text: "Jeg har laget noen små prosjekter.",
        header_fields_response: { experience: "TypeScript og Python." },
      },
    ],
  },
];

const visitApplications = (
  viewport: [number, number] = [1440, 900],
  admissionResponse: object = admission,
  applicationResponse: object = applications,
  delaySecondApplicationResponse = false,
) => {
  cy.viewport(...viewport);
  cy.intercept("GET", "**/api/admission/webkom-test/", admissionResponse).as(
    "admission",
  );
  cy.intercept("GET", "**/api/admission/webkom-test/application/mine/", {
    statusCode: 404,
    body: {},
  });
  const applicationRequests = { count: 0 };
  cy.intercept(
    "GET",
    "**/api/admin/admission/webkom-test/application/",
    (request) => {
      applicationRequests.count += 1;
      request.reply({
        body: applicationResponse,
        delay:
          delaySecondApplicationResponse && applicationRequests.count === 2
            ? 4000
            : 0,
      });
    },
  ).as("applications");
  cy.login("webkom");
  cy.visit("/webkom-test/admin");
  cy.wait(["@admission", "@applications"]);
  return applicationRequests;
};

describe("admin applications review", () => {
  it("keeps revealed candidate data visible during a background refresh", () => {
    const applicationRequests = visitApplications(
      [1440, 900],
      admission,
      applications,
      true,
    );
    cy.contains("button", "Vis kandidatdata").click();

    cy.window().then((window) =>
      window.document.dispatchEvent(new Event("visibilitychange")),
    );
    cy.wrap(null, { timeout: 6000 }).should(() => {
      expect(applicationRequests.count).to.equal(2);
    });
    cy.get('img[alt="Loading..."]', { timeout: 500 }).should("not.exist");
    cy.contains("Ida Nordmann").should("be.visible");
  });

  it("keeps candidate data hidden until it is explicitly revealed", () => {
    visitApplications();

    cy.contains("Kandidatdata er skjult").should("be.visible");
    cy.contains("Ida Nordmann").should("not.exist");
    cy.get('input[type="search"]').should("not.exist");

    cy.contains("button", "Vis kandidatdata").click();

    cy.contains("Viser 2 av 2 søkere").should("be.visible");
    cy.contains("th", "Søker").should("be.visible");
    cy.contains("th", "Kontakt").should("be.visible");
    cy.contains("th", "Søker til").should("be.visible");
    cy.contains("900 00 001").should("be.visible");
    cy.get('a[aria-label="Ring Ida Nordmann"]')
      .first()
      .should("have.attr", "href", "tel:90000001");
    cy.get('a[aria-label="Send melding til Ida Nordmann"]')
      .first()
      .should("have.attr", "href", "sms:90000001");
    cy.get('a[href^="mailto:"]').should("not.exist");
  });

  it("hides the group column when displayed applications target one group", () => {
    const singleTargetApplications = applications.map((application) => ({
      ...application,
      group_applications: [application.group_applications[0]],
    }));

    visitApplications([1440, 900], admission, singleTargetApplications);
    cy.contains("button", "Vis kandidatdata").click();

    cy.contains("th", "Søker til").should("not.exist");
  });

  it("shows one applicant status and structured committee applications", () => {
    visitApplications();
    cy.contains("button", "Vis kandidatdata").click();

    cy.get('button[aria-label="Vis søknadsdetaljer"]')
      .first()
      .focus()
      .should("be.focused")
      .click();

    cy.get('[aria-label^="Intervjustatus for Ida Nordmann"]')
      .filter(":visible")
      .should("have.length", 1);
    cy.contains("Generell søknad").should("not.exist");
    cy.contains("Hva motiverer deg?").should("not.exist");
    cy.contains("Relevant erfaring").should("be.visible");
    cy.contains("Hvorfor vil du søke Webkom?").should("not.exist");
    cy.contains("Hvorfor vil du søke Fagkom?").should("not.exist");
    cy.contains("Webkom").should("be.visible");
    cy.contains("Fagkom").should("be.visible");
    cy.contains("Sent den").should("be.visible");
  });

  it("filters by normalized phone number, status, and multiple groups", () => {
    visitApplications();
    cy.contains("button", "Vis kandidatdata").click();

    cy.get('input[type="search"]').type("90000002");
    cy.contains("Olav Hansen").should("be.visible");
    cy.contains("Ida Nordmann").should("not.exist");
    cy.contains("button", "Nullstill").click();

    cy.get('[aria-label="Filtrer på intervjustatus"]').click();
    cy.contains('[role="option"]', "Kalt inn").click();
    cy.contains("Olav Hansen").should("be.visible");
    cy.contains("Ida Nordmann").should("not.exist");
    cy.contains("button", "Nullstill").click();

    cy.get('summary[aria-label^="Filtrer på gruppe"]').click();
    cy.contains("label", "Fagkom").should("contain", "1").find("input").check();
    cy.contains("Ida Nordmann").should("be.visible");
    cy.contains("Olav Hansen").should("not.exist");
    cy.contains("label", "Webkom").find("input").check();
    cy.contains("Ida Nordmann").should("be.visible");
    cy.contains("Olav Hansen").should("be.visible");

    cy.get('input[type="search"]').type("finnes-ikke");
    cy.contains("Ingen søkere samsvarer med filtrene.").should("be.visible");
    cy.contains("button", "Nullstill filtre").click();
    cy.contains("Ida Nordmann").should("be.visible");
  });

  it("keeps other-committee answers hidden from recruiters", () => {
    const recruiterAdmission = {
      ...admission,
      userdata: {
        ...admission.userdata,
        is_admin: false,
        committee_role: "recruiting",
        represented_groups: ["Webkom"],
        application_view_mode: "committee_minimal",
      },
    };
    const recruiterApplications = [
      {
        pk: applications[0].pk,
        application_view_mode: "committee_minimal",
        user: { full_name: applications[0].user.full_name },
        created_at: applications[0].created_at,
        applied_within_deadline: false,
        phone_number: applications[0].phone_number,
        interview_status: applications[0].interview_status,
        interview_status_updated_at:
          applications[0].interview_status_updated_at,
        group_applications: [
          {
            group: webkom,
            text: "Jeg trives med å lære gjennom å lage produkter.",
            header_fields_response: { experience: "Et lite React-prosjekt." },
          },
        ],
      },
    ];
    visitApplications([1440, 900], recruiterAdmission, recruiterApplications);
    cy.contains("button", "Vis kandidatdata").click();

    cy.contains("900 00 001").should("be.visible");
    cy.contains("Webkom").should("be.visible");
    cy.contains("Fagkom").should("not.exist");
    cy.get('button[aria-label="Vis søknadsdetaljer"]').click();
    cy.contains("Jeg trives med å lære gjennom å lage produkter.").should(
      "be.visible",
    );
    cy.contains("Relevant erfaring").should("be.visible");
    cy.contains("Et lite React-prosjekt.").should("be.visible");
    cy.contains("Jeg liker å forklare vanskelige konsepter.").should(
      "not.exist",
    );
    cy.contains("Sent den").should("be.visible");
    cy.get('[data-cy="application-sent-time"]')
      .should("have.attr", "data-late", "true")
      .and("have.class", "text-orange-500");
    cy.get(
      'summary[aria-label^="Flere handlinger for søknaden fra Ida Nordmann"]',
    ).should("not.exist");
    cy.contains("button", "Eksporter CSV").click();
    cy.contains("Søknadstekst").should("not.exist");
    cy.contains("E-post").should("not.exist");
    cy.contains("Prioriteringer").should("not.exist");
  });

  it("names the exact committee in the destructive confirmation", () => {
    visitApplications();
    cy.contains("button", "Vis kandidatdata").click();
    cy.get('button[aria-label="Vis søknadsdetaljer"]').first().click();

    cy.get(
      'summary[aria-label="Flere handlinger for søknaden fra Ida Nordmann til Webkom"]',
    ).click();
    cy.contains('[role="menuitem"]', "Slett søknad til Webkom").click();

    cy.contains("Slett søknad til Webkom").should("be.visible");
    cy.contains(
      "Andre gruppesøknader fra kandidaten blir ikke slettet.",
    ).should("be.visible");
    cy.contains("button", "Avbryt").click();
  });

  it("uses expandable applicant cards on handheld screens", () => {
    visitApplications([390, 844]);
    cy.contains("button", "Vis kandidatdata").click();

    cy.contains("th", "Søker").should("not.be.visible");
    cy.get('button[aria-controls^="mobile-application-"]').first().click();
    cy.contains("Generell søknad").should("not.exist");
    cy.get('[aria-label^="Intervjustatus for Ida Nordmann"]')
      .filter(":visible")
      .should("have.length", 1);
  });
});
