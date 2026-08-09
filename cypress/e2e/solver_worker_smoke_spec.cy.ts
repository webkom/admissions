import type { SavedSchedule } from "../../frontend/src/types";

const admissionSlug = "webkom-past-deadline";

describe("real solver worker acceptance", () => {
  it("queues, solves, and applies the first draft without request stubbing", () => {
    cy.intercept("GET", `**/api/admin/admission/${admissionSlug}/schedule/`).as(
      "schedule",
    );
    cy.intercept(
      "GET",
      `**/api/admin/admission/${admissionSlug}/candidates/`,
    ).as("candidates");
    cy.intercept(
      "GET",
      `**/api/admin/admission/${admissionSlug}/availability/`,
    ).as("availability");
    cy.intercept("POST", "**/api/solve/").as("enqueueSolve");
    cy.login("webkom");
    cy.visit(`/${admissionSlug}/schedule`);
    for (const requestAlias of ["@schedule", "@candidates", "@availability"]) {
      cy.wait(requestAlias).its("response.statusCode").should("eq", 200);
    }

    cy.get('nav[aria-label="Steg i intervjuplanleggingen"]')
      .contains("button", "Planutkast")
      .should("be.enabled")
      .click();
    cy.get("[data-cy=generate-proposal]").should("be.enabled").click();

    cy.wait("@enqueueSolve").then(({ response }) => {
      expect(response?.statusCode).to.equal(202);
      expect(response?.body.status).to.equal("PENDING");
      const jobId = response?.body.job_id as string;
      expect(jobId).to.match(/^[0-9a-f-]{36}$/i);

      cy.task("runSolverWorkerOnce", { jobId }, { timeout: 120_000 });
      cy.request(`/api/solve/${jobId}/`).then(({ body, status }) => {
        expect(status).to.equal(200);
        expect(body.status).to.equal("DONE");
        expect(body.result.status).to.equal("SUCCESS");
        expect(body.applied_at).to.be.a("string").and.not.be.empty;
      });
    });

    cy.request<SavedSchedule>(
      `/api/admin/admission/${admissionSlug}/schedule/`,
    ).then(({ body, status }) => {
      expect(status).to.equal(200);
      expect(body.schedule).to.have.length(2);
      expect(body.is_distributed).to.equal(false);
    });
    cy.get("[data-cy=conflict-collection]", { timeout: 30_000 })
      .should("be.visible")
      .and("contain.text", "2 kandidater klare for kontroll");
  });
});
