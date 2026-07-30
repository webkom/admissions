import {
  DEFAULT_SOLVER_OPTIONS,
  deriveAdvancedSettingsSummary,
} from "../../frontend/src/components/Scheduling/Solver/solverHelpers";
import { visitStaticFixture } from "../support/staticFixtures";
import { collectUnhandledRejections } from "../support/unhandledRejections";

const mountSolverSetup = (
  scenario:
    | "ready"
    | "blocked"
    | "candidates-loading"
    | "rerun"
    | "rerun-saving"
    | "rerun-waiting"
    | "experience-failure" = "ready",
) => {
  visitStaticFixture("solver-setup-panel", { scenario });
  cy.get("[data-cy=solver-setup-harness]").should("exist");
};

const solverOptions = () =>
  cy.get("[data-cy=solver-options]").then(
    ($output) =>
      JSON.parse($output.text()) as {
        enforce_same_gender: boolean;
        require_experienced_panel: boolean;
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

const solverInterviewers = () =>
  cy.get("[data-cy=solver-interviewers]").then(
    ($output) =>
      JSON.parse($output.text()) as Array<{
        id: string;
        name: string;
        experience_level?: string;
      }>,
  );

const openAdvancedSettings = () =>
  cy.get("[data-cy=open-advanced-generation-settings]").click();

describe("advanced settings summary model", () => {
  it("describes the quiet strict default without treating strategy as a rule", () => {
    expect(deriveAdvancedSettingsSummary(DEFAULT_SOLVER_OPTIONS)).to.deep.equal(
      {
        requirementCount: 1,
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

  it("starts with the recommendation and reveals controls only on request", () => {
    cy.get("[data-cy=panel-size]").should("not.exist");
    cy.get('[aria-label="Planleggingsstrategi"]').should("not.exist");
    cy.get("[data-cy=advanced-settings-summary]").should("not.exist");

    openAdvancedSettings();
    cy.get("[data-cy=generation-workspace]").should("be.visible");
    cy.get("[data-cy=generation-sample-preview]")
      .should("be.visible")
      .and("contain.text", "Illustrasjon med eksempeldata")
      .and("contain.text", "ikke et beregnet planforslag");
    cy.viewport(1280, 900);
    cy.screenshot("scheduler-workflow/02-first-solve-settings", {
      capture: "viewport",
    });
    cy.get("[data-cy=panel-size]").should("have.length", 1);
    cy.get('[aria-label="Planleggingsstrategi"]')
      .should("contain.text", "Balansert - anbefalt")
      .click();
    cy.get('[role="listbox"][aria-label="Planleggingsstrategi"]')
      .should("contain.text", "Kompakte intervjudager")
      .and("contain.text", "Jevn arbeidsmengde")
      .and("not.contain.text", "Følg tilgjengeligheten");
    cy.contains("button", "Ferdig").click();
    cy.get("[data-cy=generation-workspace]").should("not.exist");

    cy.get("[data-cy=generate-proposal]").should("have.length", 1).click();
    cy.get("[data-cy=solve-count]").should("have.text", "1");
    cy.get('[aria-label="Håndtering av manglende tilgjengelighet"]').should(
      "not.exist",
    );
  });

  it("offers comparison only when requested", () => {
    cy.contains("Kompakte intervjudager").should("not.exist");
    openAdvancedSettings();
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
    openAdvancedSettings();
    cy.get('[aria-label="Planleggingsstrategi"]').click();
    cy.contains('[role="option"]', "Jevn arbeidsmengde").click();

    cy.get("[data-cy=generation-workspace]")
      .should("contain.text", "Panel")
      .should("contain.text", "Krav")
      .and("contain.text", "Prioritering")
      .and("contain.text", "Panel i samme blokk")
      .and("contain.text", "Hvile mellom arbeidsblokker")
      .and("not.contain.text", "Kompakte intervjudager")
      .and("not.contain.text", "Reparasjonsstrategi")
      .find('[role="switch"]')
      .should("have.length", 3);

    solverOptions().should((options) => {
      expect(options.initial_strategy).to.equal("balance_workload");
      expect(options.prioritize_continuity).to.equal(false);
      expect(options.load_balance_weight).to.equal(10);
    });
  });

  it("keeps advanced rules independent and restores only those rules", () => {
    openAdvancedSettings();
    cy.get('[aria-label="Planleggingsstrategi"]').click();
    cy.contains('[role="option"]', "Jevn arbeidsmengde").click();
    cy.get("[data-cy=generation-workspace]")
      .contains('[role="switch"]', "Samme kjønn i panel")
      .click();
    cy.get("[data-cy=reset-advanced-generation-settings]").click();

    solverOptions().should((options) => {
      expect(options.enforce_same_gender).to.equal(false);
      expect(options.require_experienced_panel).to.equal(true);
      expect(options.panel_stability).to.equal("preferred");
      expect(options.same_panel_per_block).to.equal(false);
      expect(options.avoid_consecutive_interviewer_blocks).to.equal(true);
      expect(options.initial_strategy).to.equal("balance_workload");
      expect(options.prioritize_continuity).to.equal(false);
      expect(options.availability_fallback).to.equal("stop");
    });
  });

  it("closes the inline setup and restores focus", () => {
    openAdvancedSettings();
    cy.get("#advanced-generation-settings-heading")
      .should("be.focused")
      .type("{esc}");
    cy.get("[data-cy=generation-workspace]").should("not.exist");
    cy.focused().should(
      "have.attr",
      "data-cy",
      "open-advanced-generation-settings",
    );

    openAdvancedSettings();
    cy.contains("button", "Ferdig").click();
    cy.get("[data-cy=generation-workspace]").should("not.exist");
    cy.focused().should(
      "have.attr",
      "data-cy",
      "open-advanced-generation-settings",
    );
  });

  it("dismisses an open strategy menu before closing the setup", () => {
    openAdvancedSettings();
    cy.get('[aria-label="Planleggingsstrategi"]').click().type("{esc}");
    cy.get('[role="listbox"][aria-label="Planleggingsstrategi"]').should(
      "not.exist",
    );
    cy.get("[data-cy=generation-workspace]").should("be.visible");

    cy.focused().type("{esc}");
    cy.get("[data-cy=generation-workspace]").should("not.exist");
    cy.focused().should(
      "have.attr",
      "data-cy",
      "open-advanced-generation-settings",
    );
  });

  it("updates the illustrative table with the selected setup", () => {
    openAdvancedSettings();
    cy.get("[data-cy=generation-sample-preview]")
      .should("have.attr", "data-panel-size", "1")
      .and("have.attr", "data-strategy", "balanced");
    cy.get("[data-cy=generation-sample-period]").then(($periods) => {
      expect(
        [...$periods].map((period) => period.textContent?.trim()),
      ).to.deep.equal(["Man morgen", "Man morgen", "Tir morgen", "Tir morgen"]);
    });

    cy.get('[role="group"][aria-label="Panelstørrelse"]')
      .find('button[aria-label="Øk"]')
      .click();
    cy.get("[data-cy=generation-sample-preview]").should(
      "have.attr",
      "data-panel-size",
      "2",
    );
    cy.get("[data-cy=generation-sample-panel]")
      .first()
      .should("have.text", "Intervjuer A, Intervjuer B");

    cy.get('[aria-label="Planleggingsstrategi"]').click();
    cy.contains('[role="option"]', "Kompakte intervjudager").click();
    cy.get("[data-cy=generation-preview-strategy]").should(
      "have.text",
      "Kompakte intervjudager",
    );
    cy.get("[data-cy=generation-sample-period]").each(($period) => {
      cy.wrap($period).should("have.text", "Man morgen");
    });

    cy.get('[aria-label="Planleggingsstrategi"]').click();
    cy.contains('[role="option"]', "Jevn arbeidsmengde").click();
    cy.get("[data-cy=generation-sample-period]").then(($periods) => {
      expect(
        [...$periods].map((period) => period.textContent?.trim()),
      ).to.deep.equal([
        "Man morgen",
        "Man ettermiddag",
        "Tir morgen",
        "Tir ettermiddag",
      ]);
    });

    cy.get('[aria-label="Planleggingsstrategi"]').click();
    cy.contains('[role="option"]', "Kompakte intervjudager").click();
    cy.contains('[role="radio"]', "La panelet variere").click();
    cy.get("[data-cy=generation-preview-stability]").should(
      "have.text",
      "Panelet kan variere",
    );
    cy.get("[data-cy=generation-sample-panel]")
      .eq(1)
      .should("have.text", "Intervjuer B, Intervjuer C");

    cy.contains('[role="switch"]', "Samme kjønn i panel").click();
    cy.get("[data-cy=generation-preview-requirements]")
      .should("contain.text", "Samme kjønn")
      .and("contain.text", "Erfaren intervjuer");
  });

  it("offers a direct way to select experienced interviewers", () => {
    openAdvancedSettings();
    cy.contains("Ingen intervjuere er markert som erfarne ennå.").should(
      "not.exist",
    );
    cy.get("[data-cy=open-experience-levels]")
      .should("contain.text", "Velg erfarne")
      .click();
    cy.get("[data-cy=generation-workspace]").should("not.exist");
    cy.get("[data-cy=navigation-action]").should("have.text", "");
    cy.get("[data-cy=inline-experience-editor]")
      .should("be.visible")
      .and("contain.text", "Erfarne intervjuere");
    cy.get(
      '[role="radiogroup"][aria-label="Erfaringsnivå for Linus i planutkast"]',
    )
      .contains('[role="radio"]', "Erfaren")
      .click();
    solverInterviewers().should((interviewers) => {
      expect(
        interviewers.find((interviewer) => interviewer.name === "Linus")
          ?.experience_level,
      ).to.equal("experienced");
    });
  });

  it("keeps a rejected experience change retryable without an unhandled rejection", () => {
    mountSolverSetup("experience-failure");
    collectUnhandledRejections().as("unhandledRejections");
    openAdvancedSettings();
    cy.get("[data-cy=open-experience-levels]").click();
    cy.get(
      '[role="radiogroup"][aria-label="Erfaringsnivå for Linus i planutkast"]',
    )
      .contains('[role="radio"]', "Erfaren")
      .click();

    cy.get(
      '[role="radiogroup"][aria-label="Erfaringsnivå for Linus i planutkast"]',
    )
      .contains('[role="radio"]', "Ukjent")
      .should("have.attr", "aria-checked", "true");
    cy.get<unknown[]>("@unhandledRejections").should("have.length", 0);
  });
});

describe("solver readiness and regeneration", () => {
  it("does not report missing candidates before the candidate scope resolves", () => {
    mountSolverSetup("candidates-loading");
    cy.contains("Henter kandidater").should("be.visible");
    cy.contains("Ingen kandidater").should("not.exist");
    cy.get("[data-cy=generate-proposal]").should("be.disabled");
  });

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
        cy.contains("summary", "Endre planen").click();
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
      cy.get("[data-cy=proposal-review]")
        .should("be.visible")
        .within(() => {
          cy.get("[data-cy=plan-draft-next-action]").should("not.exist");
          cy.get("[data-cy=proposal-primary-action]").should("not.exist");
          cy.get('[aria-live="polite"]').should("not.exist");
        });
      cy.get("[data-cy=regeneration-settings]")
        .find("[data-cy=generate-proposal]")
        .should("be.visible");
      if (trigger === "proposal-rerun") {
        cy.viewport(1280, 900);
        cy.screenshot("scheduler-workflow/03-regeneration-settings", {
          capture: "viewport",
        });
      }
      cy.contains("button", "Tilbake til planutkast").focus().click();
      cy.get("[data-cy=regeneration-settings]").should("not.exist");
      cy.get("[data-cy=proposal-review]").should("be.visible");
    });
  });

  it("keeps preview and edit as reversible plan modes", () => {
    mountSolverSetup("rerun-saving");
    cy.get("[data-cy=view-switcher]")
      .should("contain.text", "Liste")
      .and("contain.text", "Kalender")
      .and("not.contain.text", "Belastning");
    cy.get("[data-cy=plan-health-summary]")
      .should("contain.text", "1 av 2 planlagt")
      .and("not.contain.text", "Ingen planproblemer");
    cy.contains("th", "Behold").should("not.exist");

    cy.contains("summary", "Endre planen").click();
    cy.contains("button", "Rediger planutkast").click();
    cy.get("[data-cy=manual-schedule-editing]").should(
      "contain.text",
      "Endringer lagres automatisk",
    );
    cy.contains("th", "Behold").should("be.visible");
    cy.viewport(1280, 900);
    cy.screenshot("scheduler-workflow/04-draft-manual-edit", {
      capture: "viewport",
    });
    cy.get("[data-cy=proposal-primary-action]").should(
      "contain.text",
      "Gå til forhåndsvisning",
    );
    cy.get("[data-cy=proposal-primary-action]").click();
    cy.get("[data-cy=manual-schedule-editing]").should("not.exist");
    cy.contains("Lagrer utkast…").should("be.visible");
  });

  it("supports keyboard navigation and focus restoration in the plan-change menu", () => {
    mountSolverSetup("rerun");
    cy.contains("summary", "Endre planen").as("draftActionMenu").click();
    cy.contains('[role="menuitem"]', "Rediger planutkast").should("be.focused");
    cy.focused().type("{downarrow}");
    cy.focused().should("contain.text", "Vis belastning");
    cy.focused().type("{esc}");
    cy.get("@draftActionMenu").should("be.focused");
    cy.get("@draftActionMenu")
      .parent("details")
      .should("not.have.attr", "open");
  });

  it("shows one dominant explanation when a candidate is missing a placement", () => {
    mountSolverSetup("rerun");
    cy.get("[data-cy=proposal-review] h2")
      .should("have.attr", "tabindex", "-1")
      .focus()
      .should("have.css", "outline-style", "solid");
    cy.focused().should("contain.text", "Planutkast");
    cy.get("[data-cy=plan-health-summary]")
      .should("contain.text", "1 av 2 planlagt")
      .and("not.contain.text", "mangler plass");
    cy.get("[data-cy=plan-draft-next-action]")
      .should("have.length", 1)
      .and("have.attr", "role", "alert")
      .and("contain.text", "1 kandidat mangler intervju");
    cy.get("[data-cy=proposal-workflow-notice]").should("not.exist");
  });

  it("keeps a completed candidate check revisitable while others are pending", () => {
    mountSolverSetup("rerun-waiting");
    cy.get("[data-cy=plan-draft-next-action]")
      .should("contain.text", "Kandidatkontroll")
      .and("contain.text", "Venter på Grace");
    cy.contains("summary", "Endre planen").click();
    cy.get("[data-cy=reopen-candidate-review]").click();
    cy.get("[data-cy=navigation-action]").should("have.text", "review");
  });

  [390, 768, 1280].forEach((width) => {
    it(`contains the inline setup at ${width}px`, () => {
      cy.viewport(width, 850);
      mountSolverSetup();
      openAdvancedSettings();
      cy.get("[data-cy=generation-workspace]").should(($workspace) => {
        const rect = $workspace[0].getBoundingClientRect();
        expect(rect.left).to.be.at.least(0);
        expect(rect.right).to.be.at.most(width);
      });
      cy.get("[data-cy=advanced-settings]").then(($settings) => {
        const settingsRect = $settings[0].getBoundingClientRect();
        cy.get("[data-cy=generation-sample-preview]").should(($preview) => {
          const previewRect = $preview[0].getBoundingClientRect();
          if (width >= 1000) {
            expect(settingsRect.right).to.be.at.most(previewRect.left);
            expect(Math.abs(settingsRect.top - previewRect.top)).to.be.lessThan(
              4,
            );
          } else {
            expect(previewRect.top).to.be.at.least(settingsRect.bottom);
          }
        });
      });
      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(width);
      });
    });
  });
});
