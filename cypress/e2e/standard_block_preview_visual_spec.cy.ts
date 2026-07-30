import { visitStaticFixture } from "../support/staticFixtures";

const scenarios = [
  {
    name: "four-60-minute-with-pause",
    query: "duration=60&count=4&value=30",
    viewport: [1280, 900] as const,
  },
  {
    name: "four-30-minute-without-pause",
    query: "duration=30&count=4&value=0",
    viewport: [1280, 900] as const,
  },
  {
    name: "maximum-count-short-custom-duration",
    query: "duration=15&count=20&value=30",
    viewport: [1280, 900] as const,
  },
  {
    name: "narrow-preview-container",
    query: "duration=30&count=10&value=30",
    viewport: [390, 900] as const,
  },
];

describe("standard block preview visual scenarios", () => {
  scenarios.forEach((scenario) => {
    it(`captures ${scenario.name}`, () => {
      cy.viewport(...scenario.viewport);
      visitStaticFixture("admin-schedule-settings-popover", scenario.query);
      cy.get("[data-cy=standard-block-preview]").should("be.visible");
      cy.wait(350);
      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(
          scenario.viewport[0],
        );
      });
      if (scenario.viewport[0] === 390) {
        cy.get("[data-cy=standard-block-preview]").screenshot(
          `standard-block/${scenario.name}`,
        );
      } else {
        cy.screenshot(`standard-block/${scenario.name}`, {
          capture: "viewport",
        });
      }
    });
  });
});
