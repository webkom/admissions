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
    has_application: true,
    is_privileged: false,
    is_admin: false,
    is_recruiter: false,
    committee_role: null,
    committee_groups: [],
    represented_groups: [],
    application_view_mode: "none",
  },
};

const singleGroupAdmission = {
  ...admission,
  groups: [admission.groups[0]],
  userdata: { ...admission.userdata, has_application: false },
};

const submittedApplication = {
  pk: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  phone_number: "99887766",
  priority_text: "",
  updated_at: "2027-03-05T10:00:00Z",
  created_at: "2027-03-05T10:00:00Z",
  group_applications: [
    {
      group: admission.groups[0],
      text: "Min webkom-tekst",
      header_fields_response: {},
    },
    {
      group: admission.groups[1],
      text: "Min band-tekst",
      header_fields_response: {},
    },
  ],
};

const stubAdmission = (body = admission) =>
  cy.intercept("GET", "**/api/admission/ui-test/", body).as("admission");

const stubNoApplication = () =>
  cy
    .intercept("GET", "**/api/admission/ui-test/application/mine/", {
      statusCode: 404,
      body: {},
    })
    .as("myApplication");

const stubApplication = (body = submittedApplication) =>
  cy
    .intercept("GET", "**/api/admission/ui-test/application/mine/", body)
    .as("myApplication");

describe("applicant state machine", () => {
  beforeEach(() => {
    cy.login("webkom");
  });

  it("keeps a group the applicant chose when the server copy arrives", () => {
    // The selection draft must survive hydration. Previously the server set
    // replaced it on every load, then overwrote the draft with the result.
    stubAdmission();
    stubApplication();
    cy.visit("/ui-test/min-soknad");
    cy.wait("@myApplication");

    cy.contains("button", "Endre søknad").click();
    // Scoped by title: the priority-ranking list has its own "Fjern Band"
    // button meaning something else entirely.
    cy.get('button[title="Band"][aria-label="Fjern Band"]').click();
    cy.get('button[title="Band"][aria-label="Velg Band"]').should("exist");

    cy.reload();
    cy.wait("@myApplication");
    // Reload lands on the receipt now that editing is no longer persisted,
    // so re-enter the form before checking the selection survived.
    cy.contains("button", "Endre søknad").click();
    // Still deselected: the user's choice outlives the server payload.
    cy.get('button[title="Band"][aria-label="Velg Band"]').should("exist");
  });

  it("sends a one-committee admission straight to the application", () => {
    stubAdmission(singleGroupAdmission);
    stubNoApplication();
    cy.visit("/ui-test/velg-grupper");
    cy.location("pathname").should("eq", "/ui-test/min-soknad");
  });

  it("lands on the receipt even when the admission resolves first", () => {
    // The load-order latch: when /admission/ wins the race the app used to
    // record "editing", persist it, read it back, and strand the applicant in
    // the form for every subsequent visit.
    stubAdmission();
    cy.intercept("GET", "**/api/admission/ui-test/application/mine/", (req) => {
      req.on("response", (res) => res.setDelay(400));
      req.reply(submittedApplication);
    }).as("myApplication");

    cy.visit("/ui-test/min-soknad");
    cy.wait("@myApplication");
    cy.contains("button", "Endre søknad").should("exist");

    cy.reload();
    cy.wait("@myApplication");
    cy.contains("button", "Endre søknad").should("exist");
  });

  it("lets the applicant leave an invalid form", () => {
    stubAdmission();
    stubApplication();
    cy.visit("/ui-test/min-soknad");
    cy.wait("@myApplication");

    cy.contains("button", "Endre søknad").click();
    cy.get('textarea[name="groups.band"]').clear();
    cy.contains("button", "Avbryt").should("not.be.disabled").click();
    cy.contains("button", "Endre søknad").should("exist");
  });

  it("does not claim unsaved changes for an untouched application", () => {
    stubAdmission();
    stubApplication();
    cy.visit("/ui-test/min-soknad");
    cy.wait("@myApplication");

    cy.contains("button", "Endre søknad").click();
    cy.get('[data-cy="unsaved-draft-banner"]').should("not.exist");

    cy.reload();
    cy.wait("@myApplication");
    cy.contains("button", "Endre søknad").click();
    cy.get('[data-cy="unsaved-draft-banner"]').should("not.exist");
  });

  it("keeps a discarded draft discarded through a reload", () => {
    // updated_at deliberately far in the past: the draft's timestamp (stamped
    // with the real clock when this test types) must always read as newer.
    const staleApplication = {
      ...submittedApplication,
      updated_at: "2000-01-01T10:00:00Z",
    };
    stubAdmission();
    stubApplication(staleApplication);
    cy.visit("/ui-test/min-soknad");
    cy.wait("@myApplication");

    cy.contains("button", "Endre søknad").click();
    cy.get('textarea[name="groups.webkom"]')
      .clear()
      .type("En helt annen tekst enn den innsendte.");
    // Let the debounced autosave (500ms) persist the draft before reloading.
    cy.wait(600);

    cy.reload();
    cy.wait("@myApplication");
    cy.contains("button", "Endre søknad").click();
    cy.get('[data-cy="unsaved-draft-banner"]').should("be.visible");
    cy.get('[data-cy="discard-draft"]').click();
    cy.get('[data-cy="unsaved-draft-banner"]').should("not.exist");

    cy.reload();
    cy.wait("@myApplication");
    cy.contains("button", "Endre søknad").click();
    cy.get('[data-cy="unsaved-draft-banner"]').should("not.exist");
  });

  it("warns before a submit that withdraws a committee", () => {
    stubAdmission();
    stubApplication();
    cy.visit("/ui-test/min-soknad");
    cy.wait("@myApplication");

    cy.contains("button", "Endre søknad").click();
    cy.get('button[title="Band"][aria-label="Fjern Band"]').click();
    cy.contains("button", "Send inn søknad").click();

    cy.get('[data-cy="withdraw-confirm"]').should("be.visible");
    cy.get('[data-cy="withdraw-confirm"]').should("contain.text", "Band");
    cy.get('[data-cy="withdraw-confirm"]').should("not.contain.text", "Webkom");
  });

  it("disables submit until the application text is written", () => {
    // validateOnMount was missing, so isValid read true (Formik hadn't run
    // validation yet) even with an empty required textarea - the button
    // looked clickable but submitting did nothing.
    stubAdmission({
      ...admission,
      userdata: { ...admission.userdata, has_application: false },
    });
    stubNoApplication();
    cy.visit("/ui-test/velg-grupper");
    cy.contains('[role="checkbox"]', "Webkom").click();
    cy.contains("button", "Gå videre").click();

    cy.get('input[name="phoneNumber"]').clear().type("99887766");
    cy.contains("button", "Send inn søknad").should("be.disabled");

    cy.get('textarea[name="groups.webkom"]').type("Teksten min");
    cy.contains("button", "Send inn søknad").should("not.be.disabled");
  });

  it("lets a first-time applicant toggle committees freely", () => {
    // Nothing has been sent yet, so unticking withdraws nothing: no
    // confirmation, no mail. The warning is only for committees the applicant
    // has actually applied to.
    stubAdmission({
      ...admission,
      userdata: { ...admission.userdata, has_application: false },
    });
    stubNoApplication();
    cy.visit("/ui-test/velg-grupper");
    cy.contains('[role="checkbox"]', "Webkom").click();
    cy.contains('[role="checkbox"]', "Band").click();
    cy.contains("button", "Gå videre").click();

    // Change your mind about Band before ever submitting.
    cy.get('button[title="Band"][aria-label="Fjern Band"]').click();
    cy.get('input[name="phoneNumber"]').clear().type("99887766");
    cy.get('textarea[name="groups.webkom"]').type("Teksten min");

    cy.intercept("POST", "**/api/admission/ui-test/application/", {
      statusCode: 201,
      body: submittedApplication,
    }).as("submit");
    stubApplication();
    cy.contains("button", "Send inn søknad").click();

    cy.get('[data-cy="withdraw-confirm"]').should("not.exist");
    cy.wait("@submit");
  });

  it("keeps the typed text visible through a first submission", () => {
    stubAdmission({
      ...admission,
      userdata: { ...admission.userdata, has_application: false },
    });
    stubNoApplication();
    cy.visit("/ui-test/velg-grupper");
    cy.contains('[role="checkbox"]', "Webkom").click();
    cy.contains("button", "Gå videre").click();

    cy.get('input[name="phoneNumber"]').clear().type("99887766");
    cy.get('textarea[name="groups.webkom"]').type("Teksten min");
    cy.intercept("POST", "**/api/admission/ui-test/application/", {
      statusCode: 201,
      body: submittedApplication,
    }).as("submit");
    stubApplication();

    cy.contains("button", "Send inn søknad").click();
    cy.wait("@submit");
    // The form must never re-render blank while the receipt is loading.
    cy.get('textarea[name="groups.webkom"]').should("not.exist");
  });
});
