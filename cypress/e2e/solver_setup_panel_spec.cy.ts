import {
  DEFAULT_SOLVER_OPTIONS,
  deriveAdvancedSettingsSummary,
} from "../../frontend/src/components/Scheduling/Solver/solverHelpers";

const mountSolverSetup = (
  scenario: "ready" | "blocked" | "rerun" = "ready",
) => {
  cy.visit(
    `http://localhost:5001/static/cypress/fixtures/solver-setup-panel.html?scenario=${scenario}`,
  );
  cy.get("[data-cy=solver-setup-harness]").should("exist");
};

const solverOptions = () =>
  cy.get("[data-cy=solver-options]").then(
    ($output) =>
      JSON.parse($output.text()) as {
        enforce_same_gender: boolean;
        panel_stability: string;
        availability_fallback: string;
        same_panel_per_block: boolean;
        avoid_consecutive_interviewer_blocks: boolean;
        prioritize_continuity: boolean;
        allow_overtime: boolean;
        initial_strategy: string;
        repair_strategy: string;
        overtime_weight: number;
        load_balance_weight: number;
        continuity_weight: number;
      },
  );

const openAdvancedSettings = () =>
  cy.get("[data-cy=open-advanced-generation-settings]").click();

describe("advanced settings summary model", () => {
  it("describes the quiet strict default without treating strategy as a rule", () => {
    expect(deriveAdvancedSettingsSummary(DEFAULT_SOLVER_OPTIONS)).to.deep.equal(
      {
        requirementCount: 0,
        preferenceCount: 1,
        customizationCount: 0,
        availabilityLabel: "stopper ved kapasitetsmangel",
        text: "Planen foretrekker samme panel i hver blokk og prioriterer hvile mellom blokker, og stopper ved kapasitetsmangel.",
      },
    );
  });
});

describe("streamlined solver setup", () => {
  beforeEach(() => mountSolverSetup());

  it("keeps one panel control, one strategy choice and one primary action", () => {
    cy.get("[data-cy=panel-size]").should("have.length", 1);
    cy.get('[aria-label="Planleggingsstrategi"]')
      .should("contain.text", "Balansert — anbefalt")
      .click();
    cy.get('[role="listbox"][aria-label="Planleggingsstrategi"]')
      .should("contain.text", "Kompakte intervjudager")
      .and("contain.text", "Jevn arbeidsmengde")
      .and("not.contain.text", "Følg tilgjengeligheten");
    cy.get("body").type("{esc}");

    cy.get("[data-cy=generate-proposal]").should("have.length", 1).click();
    cy.get("[data-cy=solve-count]").should("have.text", "1");
    cy.get('[aria-label="Håndtering av manglende tilgjengelighet"]').should(
      "not.exist",
    );
  });

  it("offers comparison only when requested", () => {
    cy.contains("Kompakte intervjudager").should("not.exist");
    cy.contains("button", "Sammenlign strategier").click();
    cy.contains("button", "Kompakte intervjudager")
      .should("be.visible")
      .click();
    solverOptions().should((options) => {
      expect(options.initial_strategy).to.equal("compact_days");
      expect(options.prioritize_continuity).to.equal(true);
      expect(options.continuity_weight).to.equal(48);
      expect(options.load_balance_weight).to.equal(2);
    });
  });

  it("makes compact days a strategy rather than a duplicate advanced toggle", () => {
    cy.get('[aria-label="Planleggingsstrategi"]').click();
    cy.contains('[role="option"]', "Jevn arbeidsmengde").click();
    openAdvancedSettings();

    cy.get("[data-cy=generation-drawer]")
      .should("contain.text", "Krav")
      .and("contain.text", "Prioritering")
      .and("contain.text", "Panel i samme blokk")
      .and("contain.text", "Hvile mellom arbeidsblokker")
      .and("not.contain.text", "Kompakte intervjudager")
      .and("not.contain.text", "Panelstørrelse")
      .and("not.contain.text", "Reparasjonsstrategi")
      .find('[role="switch"]')
      .should("have.length", 2);

    solverOptions().should((options) => {
      expect(options.initial_strategy).to.equal("balance_workload");
      expect(options.prioritize_continuity).to.equal(false);
      expect(options.load_balance_weight).to.equal(10);
    });
  });

  it("keeps advanced rules independent and restores only those rules", () => {
    cy.get('[aria-label="Planleggingsstrategi"]').click();
    cy.contains('[role="option"]', "Jevn arbeidsmengde").click();
    openAdvancedSettings();
    cy.get("[data-cy=generation-drawer]")
      .contains('[role="switch"]', "Samme kjønn i panel")
      .click();
    cy.get("[data-cy=reset-advanced-generation-settings]").click();

    solverOptions().should((options) => {
      expect(options.enforce_same_gender).to.equal(false);
      expect(options.panel_stability).to.equal("preferred");
      expect(options.same_panel_per_block).to.equal(false);
      expect(options.avoid_consecutive_interviewer_blocks).to.equal(true);
      expect(options.initial_strategy).to.equal("balance_workload");
      expect(options.prioritize_continuity).to.equal(false);
      expect(options.availability_fallback).to.equal("stop");
    });
  });

  it("closes the advanced drawer and restores focus", () => {
    openAdvancedSettings();
    cy.get("body").type("{esc}");
    cy.get("[data-cy=generation-drawer]").should("not.exist");
    cy.focused().should(
      "have.attr",
      "data-cy",
      "open-advanced-generation-settings",
    );

    openAdvancedSettings();
    cy.contains("button", "Ferdig").click();
    cy.get("[data-cy=generation-drawer]").should("not.exist");
  });
});

describe("solver readiness and regeneration", () => {
  it("keeps the blocker and one corrective action visible", () => {
    mountSolverSetup("blocked");
    cy.get('[role="alert"]')
      .should(
        "contain.text",
        "Vent til alle intervjuere har svart eller meldt at de ikke deltar.",
      )
      .and("contain.text", "Se hvem som mangler");
    cy.get("[data-cy=generate-proposal]").should("be.disabled");
    cy.contains("button", "Se hvem som mangler").click();
    cy.get("[data-cy=navigation-action]").should("have.text", "availability");
  });

  ["proposal-rerun", "proposal-rerun-unplaceable"].forEach((trigger) => {
    it(`reveals a calm rerun panel from ${trigger}`, () => {
      mountSolverSetup("rerun");
      cy.get("[data-cy=regeneration-settings]").should("not.exist");
      if (trigger === "proposal-rerun") {
        cy.contains("summary", "Flere").click();
      }
      cy.get(`[data-cy=${trigger}]`).click();
      cy.get("[data-cy=regeneration-settings]")
        .should("be.visible")
        .and("contain.text", "2 låste intervjuer beholdes")
        .and("contain.text", "10 kan flyttes")
        .and(
          "contain.text",
          "Det gjeldende utkastet beholdes til du eventuelt velger det nye forslaget.",
        );
      cy.get("[data-cy=proposal-review]").should("be.visible");
    });
  });

  it("keeps the normal plan state quiet and reveals editing controls only on request", () => {
    mountSolverSetup("rerun");
    cy.get("[data-cy=view-switcher]")
      .should("contain.text", "Liste")
      .and("contain.text", "Kalender")
      .and("not.contain.text", "Belastning");
    cy.get("[data-cy=plan-health-summary]")
      .should("contain.text", "1 av 2 planlagt")
      .and("not.contain.text", "Ingen planproblemer");
    cy.contains("th", "Behold").should("not.exist");

    cy.contains("button", "Rediger plan").click();
    cy.get("[data-cy=manual-schedule-editing]").should(
      "contain.text",
      "Endringer lagres automatisk",
    );
    cy.contains("th", "Behold").should("be.visible");
    cy.get("[data-cy=proposal-primary-action]").should(
      "contain.text",
      "Avslutt redigering",
    );
  });

  [390, 768, 1280].forEach((width) => {
    it(`contains the advanced drawer at ${width}px`, () => {
      cy.viewport(width, 850);
      mountSolverSetup();
      openAdvancedSettings();
      cy.get("[data-cy=generation-drawer]").should(($drawer) => {
        const rect = $drawer[0].getBoundingClientRect();
        expect(rect.left).to.be.at.least(0);
        expect(rect.right).to.be.at.most(width);
        expect(rect.height).to.be.at.most(850);
      });
      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(width);
      });
    });
  });
});
