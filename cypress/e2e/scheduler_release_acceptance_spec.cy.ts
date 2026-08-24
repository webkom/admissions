import type { Admission, SavedSchedule } from "../../frontend/src/types";

const admissionSlug = "webkom-open";
const wizardStorageKey = "admissions.wizard.admin.v1";

// Scheduling is committee-scoped, so both the page route and every admin
// schedule endpoint carry the group. Resolved from the fixture admin's own
// committee rather than hardcoded, matching interview_plan_workflow_spec.
const scheduleGroupId = (admission: Admission) =>
  admission.userdata.committee_group_details[0].pk;

const withScheduleGroup = (run: (groupId: string) => void) =>
  cy.request<Admission>(`/api/admission/${admissionSlug}/`).then((response) => {
    expect(response.status).to.eq(200);
    run(scheduleGroupId(response.body));
  });

const schedulePathFor = (groupId: string) =>
  `/${admissionSlug}/schedule/${groupId}`;

const assertNoDocumentOverflow = () => {
  cy.document().then((document) => {
    const root = document.documentElement;
    const body = document.body;
    expect(
      root.scrollWidth,
      "document width stays inside the visual viewport",
    ).to.be.at.most(root.clientWidth + 1);
    expect(
      body.scrollWidth,
      "body width stays inside the visual viewport",
    ).to.be.at.most(root.clientWidth + 1);
  });
};

const visitAuthenticatedScheduler = (width: number, height: number) => {
  cy.viewport(width, height);
  cy.intercept(
    "GET",
    `**/api/admin/admission/${admissionSlug}/group/*/schedule/`,
  ).as("releaseSchedule");
  cy.intercept(
    "GET",
    `**/api/admin/admission/${admissionSlug}/group/*/candidates/`,
  ).as("releaseCandidates");
  cy.intercept(
    "GET",
    `**/api/admin/admission/${admissionSlug}/group/*/availability/`,
  ).as("releaseAvailability");
  cy.login("webkom");
  withScheduleGroup((groupId) => {
    cy.visit(schedulePathFor(groupId), {
      onBeforeLoad(window) {
        window.localStorage.setItem(wizardStorageKey, "1");
      },
    });
  });
  cy.get('nav[aria-label="Steg i intervjuplanleggingen"]', {
    timeout: 10000,
  }).should("be.visible");
  ["@releaseSchedule", "@releaseCandidates", "@releaseAvailability"].forEach(
    (requestAlias) => {
      cy.wait(requestAlias).its("response.statusCode").should("eq", 200);
    },
  );
};

const openPublishedStage = () => {
  cy.get('nav[aria-label="Steg i intervjuplanleggingen"]')
    .contains("button", /Publisering|Gjennomføring/)
    .should("be.enabled")
    .click();
  cy.contains("Intervjuplan").should("be.visible");
  cy.contains("Publisert").should("be.visible");
};

const setPageScale = (pageScaleFactor: number) =>
  cy.then(() =>
    Cypress.automation("remote:debugger:protocol", {
      command: "Emulation.setPageScaleFactor",
      params: { pageScaleFactor },
    }),
  );

const setReducedMotion = (value: "reduce" | "no-preference") =>
  cy.then(() =>
    Cypress.automation("remote:debugger:protocol", {
      command: "Emulation.setEmulatedMedia",
      params: {
        media: "",
        features: [{ name: "prefers-reduced-motion", value }],
      },
    }),
  );

describe("scheduler release acceptance", () => {
  afterEach(() => {
    setPageScale(1);
    setReducedMotion("no-preference");
  });

  (
    [
      { name: "mobile", width: 390, height: 844 },
      { name: "tablet", width: 768, height: 900 },
      { name: "desktop", width: 1280, height: 900 },
    ] as const
  ).forEach(({ name, width, height }) => {
    it(`keeps the authenticated ${name} workflow usable without page overflow`, () => {
      visitAuthenticatedScheduler(width, height);
      assertNoDocumentOverflow();

      openPublishedStage();
      cy.contains("summary", "Flere handlinger")
        .scrollIntoView()
        .should("be.visible")
        .then(($summary) => {
          const bounds = $summary[0].getBoundingClientRect();
          expect(bounds.left).to.be.at.least(0);
          expect(bounds.right).to.be.at.most(width + 1);
          expect(bounds.width).to.be.at.least(24);
          expect(bounds.height).to.be.at.least(24);
        });
      assertNoDocumentOverflow();
      cy.screenshot(`scheduler-release/${name}-published`, {
        capture: "viewport",
      });
    });
  });

  it("keeps core navigation readable and operable at 200 percent page scale", () => {
    visitAuthenticatedScheduler(1280, 900);
    setPageScale(2);

    cy.get('nav[aria-label="Steg i intervjuplanleggingen"]')
      .scrollIntoView()
      .should("be.visible")
      .within(() => {
        cy.contains("button", "Grunnlag").should("be.visible");
        cy.contains("button", "Planutkast").should("be.visible");
        cy.contains("button", /Publisering|Gjennomføring/).should("be.visible");
      });

    openPublishedStage();
    cy.contains("summary", "Flere handlinger")
      .scrollIntoView()
      .should("be.visible")
      .click();
    cy.contains('[role="menuitem"]', "Eksporter plan").should("be.focused");
    cy.focused().type("{downarrow}");
    cy.contains('[role="menuitem"]', "Lås opp og rediger").should("be.focused");
    cy.focused().type("{esc}");
    cy.contains("summary", "Flere handlinger").should("be.focused");
    assertNoDocumentOverflow();
    cy.screenshot("scheduler-release/desktop-200-percent", {
      capture: "viewport",
    });
  });

  it("captures the complete publication gate without changing the saved fixture", () => {
    cy.viewport(1280, 900);
    cy.login("webkom");
    withScheduleGroup((groupId) => {
      cy.request<SavedSchedule>(
        `/api/admin/admission/${admissionSlug}/group/${groupId}/schedule/`,
      ).then(({ body: publishedSchedule }) => {
        cy.intercept(
          "GET",
          `**/api/admin/admission/${admissionSlug}/group/${groupId}/schedule/`,
          {
            statusCode: 200,
            body: {
              ...publishedSchedule,
              is_distributed: false,
              name_visibility: "hidden",
            },
          },
        ).as("publicationReadySchedule");

        cy.visit(schedulePathFor(groupId), {
          onBeforeLoad(window) {
            window.localStorage.setItem(wizardStorageKey, "1");
          },
        });
        cy.wait("@publicationReadySchedule");
        cy.get('nav[aria-label="Steg i intervjuplanleggingen"]', {
          timeout: 10000,
        })
          .contains("button", "Publisering")
          .should("be.enabled")
          .click();

        cy.get("[data-cy=publication-gate]")
          .should("be.visible")
          .and("contain.text", "Alle krav er oppfylt.");
        cy.get("[data-cy=publish-blocked-reason]").should("not.exist");
        cy.get("[data-cy=publish-plan]")
          .should("be.enabled")
          .and("contain.text", "Publiser intervjuplan");
        assertNoDocumentOverflow();
        cy.screenshot("scheduler-workflow/08-publication-ready", {
          capture: "viewport",
        });
      });
    });
  });

  it("exposes semantic workflow controls and visible keyboard focus", () => {
    visitAuthenticatedScheduler(1280, 900);
    cy.get('nav[aria-label="Steg i intervjuplanleggingen"]')
      .find("button")
      .should("have.length", 3)
      .each(($button) => {
        expect($button.text().trim()).not.to.equal("");
        expect($button.attr("type")).to.equal("button");
      });
    cy.get('nav[aria-label="Steg i intervjuplanleggingen"]')
      .contains("button", "Grunnlag")
      .focus()
      .should("be.focused")
      .then(($focused) => {
        const style = getComputedStyle($focused[0]);
        expect(style.outlineStyle).not.to.equal("none");
        expect(parseFloat(style.outlineWidth)).to.be.greaterThan(0);
      });
  });

  it("traps and restores keyboard focus while honoring reduced motion", () => {
    visitAuthenticatedScheduler(1280, 900);
    setReducedMotion("reduce");

    cy.window().then((window) => {
      expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).to
        .be.true;
    });

    cy.contains("button", "Hjelp")
      .as("helpButton")
      .focus()
      .should("be.focused")
      .click();
    cy.get('[role="dialog"][aria-label="Veiledning"]')
      .as("wizard")
      .should("be.visible")
      .within(() => {
        cy.get('[aria-live="polite"]').should("contain.text", "Steg 0 av 3");
        cy.get(".animate-fade-in").then(($animated) => {
          const style = getComputedStyle($animated[0]);
          expect(style.animationName).to.equal("none");
        });

        cy.get("button").first().as("firstWizardButton");
        cy.get("button").last().as("lastWizardButton");
        cy.get("@lastWizardButton").focus();
        cy.press(Cypress.Keyboard.Keys.TAB);
        cy.get("@firstWizardButton").should("be.focused");
        cy.get("@firstWizardButton").trigger("keydown", {
          key: "Tab",
          code: "Tab",
          which: 9,
          shiftKey: true,
        });
        cy.get("@lastWizardButton").should("be.focused");

        cy.press(Cypress.Keyboard.Keys.RIGHT);
        cy.get('[aria-live="polite"]').should("contain.text", "Steg 1 av 3");
        cy.contains("h2", "Sett rammene og samle tilgjengelighet").should(
          "be.visible",
        );
        cy.press(Cypress.Keyboard.Keys.ESC);
      });

    cy.get('[role="dialog"][aria-label="Veiledning"]').should("not.exist");
    cy.get("@helpButton").should("be.focused");
  });

  it("scopes name visibility to the recruiter's own committee plan", () => {
    cy.viewport(1280, 900);
    cy.login("webkom");
    cy.request<Admission>(`/api/admission/${admissionSlug}/`).then(
      ({ body: verifiedAdmission }) => {
        const recruiterAdmission: Admission = {
          ...verifiedAdmission,
          userdata: {
            ...verifiedAdmission.userdata,
            is_admin: false,
            is_privileged: true,
            is_recruiter: true,
            committee_role: "recruiting",
            committee_groups: ["Webkom"],
            represented_groups: ["Webkom"],
          },
        };
        cy.intercept("GET", `**/api/admission/${admissionSlug}/`, {
          statusCode: 200,
          body: recruiterAdmission,
        });

        cy.visit(schedulePathFor(scheduleGroupId(verifiedAdmission)), {
          onBeforeLoad(window) {
            window.localStorage.setItem(wizardStorageKey, "1");
            window.localStorage.setItem("admissions.wizard.member.v1", "1");
          },
        });
        cy.get('nav[aria-label="Steg i intervjuplanleggingen"]', {
          timeout: 10000,
        }).should("be.visible");
        // A recruiter reaches the published plan through the management
        // stepper, not the member-only "Intervjuplan" step: committee-scoped
        // scheduling gives a committee's own recruiter the full workflow for
        // that committee. What they still must not get is the
        // admission-wide name visibility control asserted below.
        cy.get('nav[aria-label="Steg i intervjuplanleggingen"]')
          .contains("button", /Publisering|Gjennomføring/)
          .should("be.enabled")
          .click();
        cy.contains("Intervjuplan").should("be.visible");
        cy.contains("Publisert").should("be.visible");

        cy.contains("button", "Mine intervjuer").should("be.visible");
        // The toggle a committee recruiter sees governs their own
        // committee's plan and nothing else - matching the backend, which
        // lets a recruiter set name_visibility for the schedule they own.
        // The admission-wide variant this test used to guard against is gone
        // outright: revealed_groups and its cross-committee disclosure
        // machinery were removed with committee-scoped scheduling, so no
        // role can reveal names to another committee any more.
        cy.get('[aria-label="Synlighet for kandidatnavn"]').should("exist");
      },
    );
  });

  it("recovers on the same page only after a fresh server-confirmed scheduler role", () => {
    cy.viewport(1280, 900);
    cy.login("webkom");
    cy.request<Admission>(`/api/admission/${admissionSlug}/`).then(
      ({ body: verifiedAdmission }) => {
        let admissionReads = 0;
        cy.intercept("GET", `**/api/admission/${admissionSlug}/`, (request) => {
          admissionReads += 1;
          request.reply(
            admissionReads === 1
              ? { statusCode: 403, body: { detail: "Forbidden" } }
              : { statusCode: 200, body: verifiedAdmission },
          );
        }).as("admissionAccess");

        cy.visit(schedulePathFor(scheduleGroupId(verifiedAdmission)), {
          onBeforeLoad(window) {
            window.localStorage.setItem(wizardStorageKey, "1");
          },
        });
        cy.wait("@admissionAccess");
        cy.contains("Kandidatdata er tømt fra visningen.").should("be.visible");
        cy.contains("button", "Kontroller tilgang").click();
        cy.wait("@admissionAccess");
        cy.get('nav[aria-label="Steg i intervjuplanleggingen"]', {
          timeout: 10000,
        }).should("be.visible");
        cy.contains("Kandidatdata er tømt fra visningen.").should("not.exist");
      },
    );
  });

  it("stays fail-closed when a fresh response has no scheduler role", () => {
    cy.viewport(1280, 900);
    cy.login("webkom");
    cy.request<Admission>(`/api/admission/${admissionSlug}/`).then(
      ({ body: verifiedAdmission }) => {
        const publicAdmission: Admission = {
          ...verifiedAdmission,
          userdata: {
            ...verifiedAdmission.userdata,
            is_admin: false,
            is_privileged: false,
            is_recruiter: false,
            committee_role: null,
            committee_groups: [],
            represented_groups: [],
          },
        };
        let admissionReads = 0;
        cy.intercept("GET", `**/api/admission/${admissionSlug}/`, (request) => {
          admissionReads += 1;
          request.reply(
            admissionReads === 1
              ? { statusCode: 403, body: { detail: "Forbidden" } }
              : { statusCode: 200, body: publicAdmission },
          );
        }).as("admissionAccess");

        cy.visit(schedulePathFor(scheduleGroupId(verifiedAdmission)), {
          onBeforeLoad(window) {
            window.localStorage.setItem(wizardStorageKey, "1");
          },
        });
        cy.wait("@admissionAccess");
        cy.contains("button", "Kontroller tilgang").click();
        cy.wait("@admissionAccess");
        cy.contains(
          "Serveren bekreftet ikke en aktiv rolle i intervjuplanleggingen.",
        ).should("be.visible");
        cy.contains("Kandidatdata er tømt fra visningen.").should("be.visible");
        cy.get('nav[aria-label="Steg i intervjuplanleggingen"]').should(
          "not.exist",
        );
      },
    );
  });
});
