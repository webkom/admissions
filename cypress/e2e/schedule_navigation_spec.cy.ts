const mountNavigation = () => {
  cy.visit(
    "http://localhost:5001/static/cypress/fixtures/schedule-navigation.html",
  );
  cy.get("[data-cy=navigation-harness]").should("exist");
};

const expectNoNestedScroll = (selector: string) => {
  cy.get(selector).then(($element) => {
    const element = $element[0];
    const style = getComputedStyle(element);
    expect(style.overflowY).not.to.be.oneOf(["auto", "scroll"]);
    expect(element.scrollHeight).to.be.at.most(element.clientHeight);
  });
};

describe("schedule navigation hierarchy", () => {
  it("uses progress semantics for workflow and tab semantics locally", () => {
    cy.viewport(1280, 800);
    mountNavigation();

    cy.get('nav[aria-label="Steg i intervjuplanleggingen"]')
      .find("button")
      .should("have.length", 3)
      .and("not.have.attr", "role", "tab");
    cy.get('nav[aria-label="Steg i intervjuplanleggingen"]')
      .find('button[aria-current="step"]')
      .should("contain.text", "Grunnlag");

    cy.get('[role="tablist"][aria-label="Arbeidsområder i Grunnlag"]')
      .find('[role="tab"]')
      .should("have.length", 3)
      .each(($tab) => {
        const panelId = $tab.attr("aria-controls");
        expect(panelId).to.be.a("string");
        cy.get(`#${panelId}`).should("exist");
      });
    cy.get('[role="tablist"][aria-label="Arbeidsområder i Grunnlag"]')
      .should("contain.text", "Oppsett")
      .and("contain.text", "Min tilgjengelighet")
      .and("contain.text", "Intervjuere og dekning");
    cy.get('#foundation-tab-framework[aria-selected="true"]')
      .focus()
      .type("{rightarrow}");
    cy.get('#foundation-tab-availability[aria-selected="true"]').should(
      "have.focus",
    );
    cy.get("#foundation-panel-framework").should("have.attr", "hidden");
    cy.get("#foundation-panel-availability").should(
      "not.have.attr",
      "hidden",
    );

    cy.get('#foundation-tab-framework').click();
    cy.get('#foundation-panel-framework').within(() => {
      cy.contains("Tidsrammer").should("be.visible");
      cy.contains("Intervjublokker").should("be.visible");
      cy.get('input[aria-label="Ulagret oppsettsendring"]').type("behold meg");
    });
    cy.get('#foundation-tab-coverage').click();
    cy.get('#foundation-panel-coverage').should("not.have.attr", "hidden");
    cy.get('#foundation-panel-coverage').should(
      "contain.text",
      "Dekningsoversikt",
    );
    cy.get('#foundation-panel-framework').should("have.attr", "hidden");
    cy.get('#foundation-panel-availability').should("have.attr", "hidden");
    cy.get('#foundation-tab-framework').click();
    cy.get('input[aria-label="Ulagret oppsettsendring"]').should(
      "have.value",
      "behold meg",
    );
  });

  [390, 1280].forEach((width) => {
    it(`does not create nested navigation scroll containers at ${width}px`, () => {
      cy.viewport(width, 800);
      mountNavigation();

      expectNoNestedScroll('nav[aria-label="Steg i intervjuplanleggingen"]');
      expectNoNestedScroll(
        '[role="tablist"][aria-label="Arbeidsområder i Grunnlag"]',
      );
      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(width);
      });
    });
  });
});
