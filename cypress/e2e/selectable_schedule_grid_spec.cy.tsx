const mountGrids = () => {
  cy.visit(
    "http://localhost:5001/static/cypress/fixtures/selectable-schedule-grid.html",
  );
  cy.get("[data-cy=selectable-grid-harness]").should("exist");
};

const cell = (mode: "personal" | "setup", date: string, minute: number) =>
  cy.get(
    `[data-cy=${mode}-grid] [role="button"][aria-label^="${mode}-${date}-${minute},"]`,
  );

const adminBlock = () =>
  cy.get(
    '[data-cy=admin-grid] [data-cy=pattern-block][data-date="2026-07-21"][data-row-id="block-480"]',
  );

describe("shared selectable schedule grid", () => {
  beforeEach(mountGrids);

  it("uses one framed canvas and calm rounded cells in both flows", () => {
    cy.get("[data-cy=schedule-grid-frame]")
      .should("have.length.greaterThan", 2)
      .each(($frame) => {
        cy.wrap($frame)
          .should("have.class", "border")
          .and("have.class", "bg-surface-muted")
          .and("have.class", "p-3");
      });

    cell("personal", "2026-07-21", 480)
      .should("have.class", "rounded-md")
      .and("have.class", "border-border")
      .and("have.class", "bg-surface-base")
      .and(
        "not.have.class",
        "shadow-[inset_3px_0_0_var(--color-danger-border)]",
      )
      .and("have.class", "active:scale-[0.985]")
      .and("have.class", "hover:-translate-y-px");
    adminBlock()
      .should("have.class", "rounded-md")
      .and("have.class", "border-border")
      .and("have.class", "bg-surface-base")
      .find("[data-schedule-slot-segment] > span")
      .should("have.class", "bg-brand-activeBorder");
    adminBlock()
      .and("have.class", "active:scale-[0.985]")
      .and("have.class", "hover:-translate-y-px");

    cell("personal", "2026-07-21", 480)
      .should("have.attr", "data-selection-surface", "schedule-block")
      .and("have.attr", "data-selection-state", "active");
    adminBlock()
      .should("have.attr", "data-selection-surface", "schedule-block")
      .and("have.attr", "data-selection-state", "active");

    cy.get("[data-cy=admin-grid]").contains("button", "Enkelttider").click();
    cy.get(
      '[data-cy=admin-grid] [data-cy=fine-slot][data-date="2026-07-21"][data-minute="480"]',
    )
      .should("have.class", "bg-brand-soft")
      .and("have.class", "motion-reduce:active:scale-100");
    cy.get(
      '[data-cy=large-admin-grid] [data-cy=pattern-block][data-row-id="block-720"]',
    )
      .should("have.class", "bg-surface-base")
      .and("have.class", "motion-reduce:active:scale-100");
  });

  it("uses the same component and mark transition when deselecting", () => {
    const sharedCells = [() => cell("personal", "2026-07-21", 480), adminBlock];

    sharedCells.forEach((getCell) => {
      getCell()
        .find("[data-selection-mark] svg")
        .should("have.class", "transition-[opacity,transform]")
        .and("have.class", "scale-100");

      getCell().click();
      getCell()
        .find("[data-selection-mark] svg")
        .should("have.class", "scale-75")
        .and("have.class", "opacity-0");
      getCell()
        .find("[data-schedule-slot-segment] > span")
        .each(($segment) => {
          expect($segment.attr("style")).to.include("width: 0%");
        });
    });

    cell("personal", "2026-07-21", 480).should(
      "have.attr",
      "data-selection-state",
      "closed",
    );
    adminBlock().should("have.attr", "data-selection-state", "closed");
    cell("personal", "2026-07-21", 480)
      .should("have.class", "bg-surface-neutral")
      .find("[data-selection-closed-overlay]")
      .should("have.class", "opacity-70");
    adminBlock()
      .should("have.class", "bg-surface-neutral")
      .find("[data-selection-closed-overlay]")
      .should("have.class", "opacity-70");
  });

  it("uses the same cell system for the read-only availability overview", () => {
    const overviewCell = (date: string, chunkIndex: number) =>
      cy.get(
        `[data-cy=availability-overview] [data-date="${date}"][data-chunk-index="${chunkIndex}"]`,
      );

    cy.get(
      '[data-cy=availability-overview] [data-cy="availability-day-header"][data-date="2026-07-21"]',
    ).then(($header) => {
      const headerRect = $header[0].getBoundingClientRect();
      overviewCell("2026-07-21", 0).then(($cell) => {
        const cellRect = $cell[0].getBoundingClientRect();
        expect(Math.abs(headerRect.left - cellRect.left)).to.be.lessThan(1);
        expect(Math.abs(headerRect.right - cellRect.right)).to.be.lessThan(1);
      });
    });

    cy.get(
      '[data-cy=availability-overview] [data-cy="availability-overview-legend"]',
    ).should("not.exist");

    overviewCell("2026-07-21", 0)
      .should("contain.text", "2/2")
      .and("have.class", "border-border")
      .and("have.class", "bg-brand-soft")
      .find("[data-schedule-slot-segment] > span")
      .should("have.class", "motion-reduce:transition-none")
      .and("have.attr", "style")
      .and("include", "width: 100%");

    overviewCell("2026-07-21", 1)
      .should("contain.text", "1/2")
      .and("have.class", "bg-surface-base")
      .find("[data-schedule-slot-segment] > span")
      .should("have.class", "motion-reduce:transition-none")
      .and("have.attr", "style")
      .and("include", "width: 50%");

    overviewCell("2026-07-21", 2)
      .should("contain.text", "0/2")
      .and("have.class", "bg-surface-base")
      .and("not.have.class", "bg-surface-neutral");

    overviewCell("2026-07-22", 1)
      .should("not.contain.text", "(kort blokk)")
      .and("not.contain.text", "0/2")
      .and("not.contain.text", "tilgjengelige")
      .and("have.attr", "aria-label")
      .and("include", "onsdag 22. juli")
      .and("have.attr", "tabindex", "-1")
      .and("have.class", "bg-surface-neutral");

    cy.get("[data-cy=availability-overview-large-panel]")
      .should("be.visible")
      .and("not.contain.text", "Panel på")
      .and("not.contain.text", "panelstørrelsen eller ta med flere");
  });

  it("keeps selected, unselected and blocked semantics distinct", () => {
    cell("personal", "2026-07-21", 480)
      .should("have.attr", "aria-pressed", "true")
      .and("have.attr", "aria-disabled", "false")
      .and("have.attr", "tabindex", "0")
      .find("[data-schedule-slot-segment]")
      .should("have.length", 2);

    cell("personal", "2026-07-21", 480)
      .click()
      .should("have.attr", "aria-pressed", "false")
      .and("have.class", "bg-surface-neutral");

    cell("setup", "2026-07-21", 480)
      .click()
      .should("have.attr", "aria-pressed", "false")
      .and("have.class", "bg-surface-neutral")
      .and("have.attr", "tabindex", "0");

    cy.get(
      '[data-cy=personal-grid] [role="button"][aria-label="personal-blocked"]',
    )
      .should("have.attr", "aria-disabled", "true")
      .and("have.attr", "tabindex", "-1")
      .and("have.class", "border-dashed")
      .and("have.class", "bg-surface-muted");

    cy.get(
      '[data-cy=personal-grid] [role="button"][aria-label="personal-blocked"]',
    )
      .find("[data-selection-closed-overlay]")
      .should("have.class", "opacity-35")
      .and("have.class", "[background-image:var(--pattern-unavailable)]");

    cy.get(
      '[data-cy=personal-grid] [role="button"][aria-label="personal-blocked"]',
    )
      .trigger("pointerdown", { pointerId: 3, force: true })
      .should("have.attr", "aria-pressed", "false");
  });

  it("uses grid headers with one roving tab stop", () => {
    cy.get(
      '[data-cy=personal-grid] [role="grid"][aria-label="personal availability"]',
    )
      .should("exist")
      .within(() => {
        cy.get('[role="columnheader"]').should("have.length", 2);
        cy.get('[role="rowheader"]').should("have.length", 2);
        cy.get('[role="button"][tabindex="0"]')
          .should("have.length", 1)
          .and("have.attr", "aria-label")
          .and("include", "personal-2026-07-21-480");
      });
  });

  it("moves the roving focus by row and column while skipping blocked cells", () => {
    cell("personal", "2026-07-21", 480).focus();
    cy.focused().trigger("keydown", { key: "End" });
    cy.focused().should(
      "have.attr",
      "aria-label",
      "personal-2026-07-21-480, 2 av 2",
    );

    cy.focused().trigger("keydown", { key: "ArrowDown" });
    cy.focused().should(
      "have.attr",
      "aria-label",
      "personal-2026-07-21-600, 0 av 2",
    );
    cy.focused().trigger("keydown", { key: "ArrowRight" });
    cy.focused().should(
      "have.attr",
      "aria-label",
      "personal-2026-07-22-600, 0 av 2",
    );
    cy.focused().trigger("keydown", { key: "Home" });
    cy.focused().should(
      "have.attr",
      "aria-label",
      "personal-2026-07-21-600, 0 av 2",
    );
    cy.focused().trigger("keydown", { key: "End" });
    cy.focused().should(
      "have.attr",
      "aria-label",
      "personal-2026-07-22-600, 0 av 2",
    );
  });

  it("handles synthesized clicks once without duplicating pointer activation", () => {
    cell("personal", "2026-07-21", 600)
      .should("have.attr", "aria-pressed", "false")
      .then(($cell) => {
        ($cell[0] as HTMLElement).click();
      });
    cell("personal", "2026-07-21", 600).should(
      "have.attr",
      "aria-pressed",
      "true",
    );

    cell("personal", "2026-07-21", 480)
      .should("have.attr", "aria-pressed", "true")
      .trigger("pointerdown", { pointerId: 40 })
      .trigger("click", { detail: 1 })
      .should("have.attr", "aria-pressed", "false");
    cy.window().trigger("pointerup", { pointerId: 40 });
  });

  it("keeps day headers focused on the standard-block checkbox", () => {
    const dayCheckbox =
      '[data-cy=admin-grid] input[aria-label^="Alle blokker for"]';
    cy.get(dayCheckbox).should("have.length.greaterThan", 0).first().check();
    cy.get(
      '[data-cy=admin-grid] [data-date="2026-07-21"][data-cy="pattern-block"]',
    )
      .should("have.length.greaterThan", 0)
      .and("have.attr", "aria-pressed", "true");
    cy.get(dayCheckbox).first().uncheck();
    cy.get(
      '[data-cy=admin-grid] [data-date="2026-07-21"][data-cy="pattern-block"]',
    )
      .should("have.length.greaterThan", 0)
      .and("have.attr", "aria-pressed", "false");
    cy.contains("Steng all kapasitet denne dagen").should("not.exist");
  });

  it("includes the day in every admin grid control name", () => {
    adminBlock().should("have.attr", "aria-label").and("contain", "Tir 21.07");

    cy.get("[data-cy=admin-grid]").contains("button", "Enkelttider").click();
    cy.get(
      '[data-cy=admin-grid] [data-cy=fine-slot][data-date="2026-07-21"][data-minute="480"]',
    )
      .should("have.attr", "aria-label")
      .and("contain", "Tir 21.07");
    cy.get(
      '[data-cy=admin-grid] [data-cy=planned-pause][data-date="2026-07-21"]',
    )
      .should("have.attr", "aria-label")
      .and("contain", "Tir 21.07");
    cy.get(
      '[data-cy=admin-grid] [data-cy=planned-pause][data-date="2026-07-21"]',
    ).click();
    cy.get("[data-cy=schedule-slot-editor]")
      .should("have.attr", "aria-labelledby")
      .then((titleId) => {
        cy.document().then((document) => {
          cy.wrap(document.getElementById(titleId)).should(
            "contain.text",
            "Tir 21.07",
          );
        });
      });
    cy.focused().should("have.attr", "data-slot");
    cy.focused().should("have.attr", "aria-label").and("contain", "Tir 21.07");
    cy.get("body").type("{esc}");
  });

  it("uses the same Enter and Space toggle path in both modes", () => {
    cell("personal", "2026-07-21", 600)
      .focus()
      .trigger("keydown", { key: "Enter" })
      .should("have.attr", "aria-pressed", "true")
      .trigger("keydown", { key: " " })
      .should("have.attr", "aria-pressed", "false");

    cell("setup", "2026-07-21", 600)
      .focus()
      .trigger("keydown", { key: " " })
      .should("have.attr", "aria-pressed", "true")
      .trigger("keydown", { key: "Enter" })
      .should("have.attr", "aria-pressed", "false");
  });

  it("exposes a partial block as mixed and clears it completely", () => {
    cy.get('[data-cy=partial-grid] [role="button"]')
      .should("have.attr", "aria-pressed", "mixed")
      .and("have.attr", "aria-label", "partial-block, 1 av 2")
      .click()
      .should("have.attr", "aria-pressed", "false")
      .and("have.attr", "aria-label", "partial-block, 0 av 2");
  });

  it("adds and removes cells through pointer drag in both modes", () => {
    (["personal", "setup"] as const).forEach((mode, index) => {
      cell(mode, "2026-07-21", 600).trigger("pointerdown", {
        pointerId: 10 + index,
      });
      cell(mode, "2026-07-22", 600).trigger("pointerover", {
        pointerId: 10 + index,
      });
      cy.window().trigger("pointerup", { pointerId: 10 + index });
      cell(mode, "2026-07-21", 600).should("have.attr", "aria-pressed", "true");
      cell(mode, "2026-07-22", 600).should("have.attr", "aria-pressed", "true");

      cell(mode, "2026-07-21", 600).trigger("pointerdown", {
        pointerId: 20 + index,
      });
      cell(mode, "2026-07-22", 600).trigger("pointerover", {
        pointerId: 20 + index,
      });
      cy.window().trigger("pointercancel", { pointerId: 20 + index });
      cell(mode, "2026-07-21", 600).should(
        "have.attr",
        "aria-pressed",
        "false",
      );
      cell(mode, "2026-07-22", 600).should(
        "have.attr",
        "aria-pressed",
        "false",
      );
    });
  });

  it("keeps block identities while fine tuning expands the pause timeline", () => {
    cy.get(
      '[data-cy=admin-grid] [data-cy=pattern-block][data-date="2026-07-21"]',
    ).should("have.length", 2);
    cy.get("[data-cy=admin-grid]").contains("button", "Enkelttider").click();
    cy.get('[data-cy=admin-grid] [data-date="2026-07-21"][data-row-id]').should(
      "have.length",
      3,
    );
    cy.get(
      '[data-cy=admin-grid] [data-cy=pattern-block][data-date="2026-07-21"]',
    ).should("have.length", 2);
    cy.get(
      '[data-cy=admin-grid] [data-cy=pattern-block][data-row-id="block-480"]',
    ).should("exist");
    cy.get(
      '[data-cy=admin-grid] [data-cy=pattern-block][data-row-id="block-600"]',
    ).should("exist");
    cy.get(
      '[data-cy=admin-grid] [data-cy=planned-pause][data-date="2026-07-21"]',
    ).should("exist");

    cy.get(
      '[data-cy=admin-grid] [data-cy=fine-slot][data-date="2026-07-21"][data-minute="510"]',
    )
      .click()
      .should("have.attr", "aria-pressed", "false");
    cy.get(
      '[data-cy=admin-grid] [data-cy=pattern-block][data-date="2026-07-21"][data-row-id="block-480"]',
    ).should("contain.text", "1/2");
    cy.get(
      '[data-cy=admin-grid] [data-cy=pattern-block][data-boundary-short="true"]',
    )
      .should("have.length.greaterThan", 0)
      .each(($block) => {
        cy.wrap($block).find("[data-cy=fine-slot]").should("have.length", 1);
      });
  });

  it("supports keyboard toggles and pointer drag in the stable pattern grid", () => {
    const firstBlock =
      '[data-cy=admin-grid] [data-cy=pattern-block][data-date="2026-07-21"][data-row-id="block-480"]';
    cy.get(firstBlock)
      .focus()
      .trigger("keydown", { key: "Enter" })
      .should("have.attr", "aria-pressed", "false")
      .trigger("keydown", { key: " " })
      .should("have.attr", "aria-pressed", "true");

    const shortBlock = (date: string) =>
      `[data-cy=admin-grid] [data-cy=pattern-block][data-date="${date}"][data-row-id="block-600"]`;
    cy.get(shortBlock("2026-07-21")).trigger("pointerdown", {
      pointerId: 31,
    });
    cy.get(shortBlock("2026-07-22")).trigger("pointerover", {
      pointerId: 31,
    });
    cy.window().trigger("pointerup", { pointerId: 31 });
    cy.get(shortBlock("2026-07-21")).should(
      "have.attr",
      "aria-pressed",
      "true",
    );
    cy.get(shortBlock("2026-07-22")).should(
      "have.attr",
      "aria-pressed",
      "true",
    );

    cy.get("[data-cy=admin-grid]").contains("button", "Enkelttider").click();
    const fineSlot = (minute: number) =>
      `[data-cy=admin-grid] [data-cy=fine-slot][data-date="2026-07-22"][data-minute="${minute}"]`;
    cy.get(fineSlot(480)).trigger("pointerdown", { pointerId: 32 });
    cy.get(fineSlot(510)).trigger("pointerover", { pointerId: 32 });
    cy.window().trigger("pointerup", { pointerId: 32 });
    cy.get(fineSlot(480)).should("have.attr", "aria-pressed", "true");
    cy.get(fineSlot(510)).should("have.attr", "aria-pressed", "true");

    cy.get(fineSlot(480)).trigger("pointerdown", { pointerId: 33 });
    cy.get(fineSlot(510)).trigger("pointerover", { pointerId: 33 });
    cy.get(fineSlot(480)).trigger("pointerover", { pointerId: 33 });
    cy.window().trigger("pointerup", { pointerId: 33 });
    cy.get(fineSlot(480)).should("have.attr", "aria-pressed", "false");
    cy.get(fineSlot(510)).should("have.attr", "aria-pressed", "false");
  });

  it("ignores secondary clicks and touch pans while preserving touch taps", () => {
    const target =
      '[data-cy=admin-grid] [data-cy=pattern-block][data-date="2026-07-22"][data-row-id="block-600"]';

    cy.get(target)
      .should("have.attr", "aria-pressed", "false")
      .trigger("pointerdown", {
        pointerId: 70,
        pointerType: "mouse",
        button: 2,
        isPrimary: true,
      })
      .should("have.attr", "aria-pressed", "false");
    cy.window().trigger("pointerup", { pointerId: 70 });

    cy.get(target)
      .trigger("pointerdown", {
        pointerId: 73,
        pointerType: "mouse",
        button: 0,
        ctrlKey: true,
        isPrimary: true,
      })
      .should("have.attr", "aria-pressed", "false");
    cy.window().trigger("pointerup", { pointerId: 73 });

    cy.get(target)
      .trigger("pointerdown", {
        pointerId: 74,
        pointerType: "mouse",
        button: 0,
        isPrimary: false,
      })
      .should("have.attr", "aria-pressed", "false");
    cy.window().trigger("pointerup", { pointerId: 74 });

    cy.get(target).trigger("pointerdown", {
      pointerId: 75,
      pointerType: "touch",
      button: 0,
      isPrimary: true,
      clientX: 10,
      clientY: 10,
    });
    cy.window().trigger("pointercancel", { pointerId: 75 });
    cy.get(target).should("have.attr", "aria-pressed", "false");

    cy.get(target).trigger("pointerdown", {
      pointerId: 71,
      pointerType: "touch",
      button: 0,
      isPrimary: true,
      clientX: 10,
      clientY: 10,
    });
    cy.window().trigger("pointermove", {
      pointerId: 71,
      clientX: 40,
      clientY: 10,
    });
    cy.window().trigger("pointerup", {
      pointerId: 71,
      clientX: 40,
      clientY: 10,
    });
    cy.get(target).should("have.attr", "aria-pressed", "false");

    cy.get(target).trigger("pointerdown", {
      pointerId: 72,
      pointerType: "touch",
      button: 0,
      isPrimary: true,
      clientX: 10,
      clientY: 10,
    });
    cy.get(target).should("have.attr", "aria-pressed", "false");
    cy.window().trigger("pointerup", {
      pointerId: 72,
      clientX: 10,
      clientY: 10,
    });
    cy.get(target).should("have.attr", "aria-pressed", "true");
  });

  it("moves focus into opt-out confirmations and restores it on cancel", () => {
    cy.get("[data-cy=personal-opt-out]")
      .contains("button", "Jeg deltar ikke")
      .click();
    cy.focused().should("contain.text", "Avbryt").click();
    cy.focused().should("contain.text", "Jeg deltar ikke");
    cy.focused().click();
    cy.contains("[data-cy=personal-opt-out] button", "Bekreft").click();
    cy.focused().should("contain.text", "Jeg deltar ikke");

    cy.get("[data-cy=availability-overview]")
      .contains("button", "Administrer")
      .click();
    cy.get("[data-cy=availability-overview]")
      .contains("button", "Deltar ikke")
      .first()
      .click();
    cy.focused().should("contain.text", "Avbryt").click();
    cy.focused().should("contain.text", "Deltar ikke");
    cy.focused().click();
    cy.get("[data-cy=availability-overview]")
      .contains("button", "Bekreft")
      .click();
    cy.focused().should("contain.text", "Deltar ikke");
  });

  it("keeps focus inside opt-out confirmations when requests fail", () => {
    cy.get("[data-cy=personal-opt-out-failure]")
      .contains("button", "Jeg deltar ikke")
      .click();
    cy.get("[data-cy=personal-opt-out-failure]")
      .contains("button", "Bekreft")
      .click();
    cy.focused().should("contain.text", "Avbryt");
    cy.get("[data-cy=personal-opt-out-failure]")
      .contains("button", "Bekreft")
      .should("be.enabled");

    cy.get("[data-cy=availability-overview-failure]")
      .contains("button", "Administrer")
      .click();
    cy.get("[data-cy=availability-overview-failure]")
      .contains("button", "Deltar ikke")
      .first()
      .click();
    cy.get("[data-cy=availability-overview-failure]")
      .contains("button", "Bekreft")
      .click();
    cy.focused().should("contain.text", "Avbryt");
    cy.get("[data-cy=availability-overview-failure]")
      .contains("button", "Bekreft")
      .should("be.enabled");
  });

  it("preserves pause extras in fine tuning", () => {
    cy.get("[data-cy=admin-grid]").within(() => {
      cy.get("[data-cy=standard-block-pattern]").should("not.exist");
      cy.get("[data-cy=planned-pause]").should("not.exist");
      cy.get("[data-cy=schedule-grid-legend]").should(
        "not.contain.text",
        "Ekstratid",
      );
    });

    cy.get("[data-cy=admin-grid]").contains("button", "Enkelttider").click();
    cy.get(
      '[data-cy=admin-grid] [data-cy=planned-pause][data-date="2026-07-21"]',
    )
      .as("pauseTrigger")
      .click();
    cy.get("[data-cy=schedule-slot-editor]")
      .should("contain.text", "Planlagt pause")
      .and("contain.text", "09:00–10:00")
      .contains("button", "09:00–09:30")
      .click();
    cy.get("[data-cy=schedule-slot-editor]").should(
      "contain.text",
      "Ekstratid",
    );
    cy.get("body").type("{esc}");
    cy.focused().should("have.attr", "data-cy", "planned-pause");
    cy.get("[data-cy=admin-grid] [data-cy=schedule-grid-legend]").should(
      "contain.text",
      "Ekstratid",
    );

    cy.get("[data-cy=admin-grid]").contains("button", "Hele blokker").click();
    cy.get(
      '[data-cy=admin-grid] [data-cy=planned-pause][data-date="2026-07-21"]',
    ).should("not.exist");
    cy.on("window:confirm", (message) => {
      expect(message).to.contain("1 ekstratid");
      return false;
    });
    cy.get("[data-cy=admin-grid]")
      .contains("button", "Steng alle tider")
      .click();
    cy.get("[data-cy=admin-grid]")
      .contains("button", "Åpne alle blokker")
      .click();
    cy.get("[data-cy=admin-grid]").contains("button", "Enkelttider").click();
    cy.get(
      '[data-cy=admin-grid] [data-cy=planned-pause][data-date="2026-07-21"]',
    ).should("contain.text", "Ekstratid, 1");
  });

  it("uses one divider for a longer pause in the compact block matrix", () => {
    cy.get("[data-cy=long-pause-admin-grid]").within(() => {
      cy.get("[data-cy=planned-pause]").should("not.exist");
      cy.get("[data-cy=long-pause-divider]").should(
        "contain.text",
        "Lengre pause, 90 min",
      );
      cy.contains("button", "Enkelttider").click();
      cy.get("[data-cy=long-pause-divider]").should("not.exist");
      cy.get("[data-cy=planned-pause]").should("have.length", 2);
    });
  });

  it("uses a viewport-aware popover for blocks larger than four interviews", () => {
    cy.viewport(390, 720);
    cy.get(
      '[data-cy=large-admin-grid] [data-cy=pattern-block][data-row-id="block-720"]',
    )
      .scrollIntoView()
      .click({ force: true });
    cy.get("[data-cy=schedule-slot-editor]")
      .should("be.visible")
      .and("contain.text", "12:00–14:30")
      .find("[data-slot]")
      .should("have.length", 5);
    cy.get("[data-cy=schedule-slot-editor]").then(($popover) => {
      const rect = $popover[0].getBoundingClientRect();
      expect(rect.left).to.be.at.least(0);
      expect(rect.right).to.be.at.most(390);
      expect(rect.bottom).to.be.at.most(720);
    });
    cy.get("body").type("{esc}");
    cy.focused()
      .should("have.attr", "data-cy", "pattern-block")
      .and("have.attr", "data-row-id", "block-720");
  });

  it("keeps the slot editor inside a short viewport and restores outside-click focus", () => {
    cy.viewport(390, 220);
    cy.get(
      '[data-cy=large-admin-grid] [data-cy=pattern-block][data-row-id="block-720"]',
    )
      .scrollIntoView()
      .as("largeBlock")
      .click({ force: true });
    cy.get("[data-cy=schedule-slot-editor]").then(($popover) => {
      const rect = $popover[0].getBoundingClientRect();
      expect(rect.top).to.be.at.least(0);
      expect(rect.left).to.be.at.least(0);
      expect(rect.right).to.be.at.most(390);
      expect(rect.bottom).to.be.at.most(220);
    });
    cy.get("body").click(2, 2, { force: true });
    cy.get("[data-cy=schedule-slot-editor]").should("not.exist");
    cy.focused()
      .should("have.attr", "data-cy", "pattern-block")
      .and("have.attr", "data-row-id", "block-720");
  });

  it("restores the current whole-block baseline after fine-tuning", () => {
    cy.get("[data-cy=admin-config-harness]").within(() => {
      cy.contains("button", "Enkelttider").click();
      cy.get('[data-cy=fine-slot][data-date="2026-07-21"][data-minute="510"]')
        .click()
        .should("have.attr", "aria-pressed", "false");

      cy.contains("button", "Hele blokker").click();
      cy.get(
        '[data-cy=pattern-block][data-date="2026-07-21"][data-row-id="block-480"]',
      ).should("have.attr", "aria-pressed", "mixed");

      cy.contains("button", "Enkelttider").click();
      cy.on("window:confirm", () => true);
      cy.contains("button", "Tilbakestill til baseline-mønster").click();
      cy.get(
        '[data-cy=fine-slot][data-date="2026-07-21"][data-minute="510"]',
      ).should("have.attr", "aria-pressed", "true");
    });
  });

  it("preserves a closed internal segment through save, reload and reset", () => {
    cy.get("[data-cy=persistence-admin-config-harness]").within(() => {
      cy.contains("button", "Enkelttider").click();
      cy.get('[data-cy=fine-slot][data-minute="510"]')
        .click()
        .should("have.attr", "aria-pressed", "false");
      cy.contains("button", "Lagre oppsett").click();
      cy.get("[data-cy=reload-persisted-config]").click();

      cy.get('[data-cy=pattern-block][data-row-id="block-480"]').should(
        "have.attr",
        "aria-pressed",
        "mixed",
      );
      cy.contains("button", "Enkelttider").click();
      cy.on("window:confirm", () => true);
      cy.contains("button", "Tilbakestill til baseline-mønster").click();
      cy.get('[data-cy=fine-slot][data-minute="510"]').should(
        "have.attr",
        "aria-pressed",
        "true",
      );
    });
  });

  it("requires an explicit reset before legacy layouts can use v2 editing", () => {
    cy.get("[data-cy=legacy-admin-config-harness]").within(() => {
      cy.contains("button", "Enkelttider").should("be.disabled");
      cy.contains("button", "Åpne alle blokker").should("be.disabled");
      cy.contains("button", "Steng alle tider").should("be.disabled");
      cy.get('input[aria-label^="Alle blokker for"]').should("be.disabled");
      cy.get('[data-cy=pattern-block][data-row-id="block-480"]')
        .should("have.attr", "aria-disabled", "true")
        .and("have.attr", "tabindex", "-1")
        .and("have.attr", "aria-pressed", "mixed");
      cy.get("[data-cy=legacy-save-payload]").should("have.text", "not-saved");

      cy.on("window:confirm", () => true);
      cy.contains("button", "Tilbakestill til dagens blokkmønster").click();
      cy.contains("button", "Åpne alle blokker").should("not.be.disabled");
      cy.get('[data-cy=pattern-block][data-row-id="block-480"]').should(
        "have.attr",
        "aria-disabled",
        "false",
      );
      cy.contains("button", "Lagre oppsett").click();
      cy.get("[data-cy=legacy-save-payload]").should(
        "have.text",
        "slot-overrides-present",
      );
    });
  });

  it("warns before a date change invalidates an existing proposal", () => {
    cy.window().then((window) => {
      cy.stub(window, "confirm").returns(false).as("proposalConfirm");
    });
    cy.get("[data-cy=proposal-confirmation-harness]").within(() => {
      cy.get('input[aria-label="Startdato for intervjuperioden"]')
        .clear()
        .type("2026-07-22")
        .should("have.value", "2026-07-22");
      cy.contains("button", "Lagre oppsett").should("not.be.disabled").click();
      cy.get("[data-cy=proposal-confirmation-save-result]").should(
        "have.text",
        "not-saved",
      );
      cy.get('input[aria-label="Startdato for intervjuperioden"]').should(
        "have.value",
        "2026-07-21",
      );
    });
    cy.get("@proposalConfirm").should(
      "have.been.calledWithMatch",
      "kan fjerne eller flytte intervjutider",
    );
  });

  it("lets the final grid row clear the sticky save footer", () => {
    cy.viewport(768, 720);
    cy.scrollTo("bottom");
    cy.get("[data-cy=admin-config-harness] [data-cy=pattern-block]")
      .last()
      .then(($lastRow) => {
        cy.get("[data-cy=admin-schedule-config-footer]").then(($footer) => {
          expect($lastRow[0].getBoundingClientRect().bottom).to.be.at.most(
            $footer[0].getBoundingClientRect().top,
          );
        });
      });
  });
});
