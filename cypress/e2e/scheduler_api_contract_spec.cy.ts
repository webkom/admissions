describe("scheduler API contract", () => {
  it("returns one canonical published schedule with revision metadata", () => {
    cy.login("webkom");
    cy.request("/api/admin/admission/webkom-open/schedule/").then(
      ({ status, body }) => {
        expect(status).to.eq(200);
        expect(body.is_distributed).to.eq(true);
        expect(body.updated_at).to.be.a("string").and.not.be.empty;
        expect(body.schedule).to.have.length(3);
        expect(
          body.schedule.every((entry: { candidate_id?: string }) =>
            Boolean(entry.candidate_id),
          ),
        ).to.eq(true);
      },
    );
  });
});
