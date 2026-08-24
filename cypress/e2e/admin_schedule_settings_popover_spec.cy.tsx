import { DURATION_PRESETS } from "../../frontend/src/components/Scheduling/Calendar/adminScheduleConfigModel";
import { formatClockMinute } from "../../frontend/src/components/Scheduling/Calendar/standardBlockPreviewModel";

const mountSettings = (
  initialPause = 30,
  initialIsCustom = false,
  interviewCount = 4,
  interviewDuration = 30,
  pending = false,
) => {
  cy.visit(
    `http://localhost:5001/static/cypress/fixtures/admin-schedule-settings-popover.html?value=${initialPause}&custom=${initialIsCustom ? "1" : "0"}&count=${interviewCount}&duration=${interviewDuration}&pending=${pending ? "1" : "0"}`,
  );
  cy.get("[data-cy=popover-harness]").should("exist");
};

const elementTopInDocument = (element: Element) =>
  element.getBoundingClientRect().top +
  (element.ownerDocument.defaultView?.scrollY ?? 0);

const chooseCustom = (label: string) =>
  cy
    .get(`[role="radiogroup"][aria-label="${label}"]`)
    .find('input[type="radio"][value="custom"]')
    .then(($input) => {
      if ($input.is(":checked"))
        cy.wrap($input).parent().click({ force: true });
      else cy.wrap($input).check({ force: true });
    });

const chooseInterviewPeriod = (startDate: string, endDate: string) => {
  cy.get("[data-cy=interview-period-trigger]").click();
  cy.get(`[data-calendar-date="${startDate}"]`).click();
  cy.get(`[data-calendar-date="${endDate}"]`).click();
  cy.get("[data-cy=apply-interview-period]").click();
};

describe("inline schedule settings and standard-block preview", () => {
  it("stacks the visual block preview under the settings", () => {
    cy.viewport(1280, 900);
    mountSettings();

    cy.get("[data-cy=block-settings-grid]").then(($settings) => {
      cy.get("[data-cy=standard-block-preview-region]").then(($preview) => {
        const settingsRect = $settings[0].getBoundingClientRect();
        const previewRect = $preview[0].getBoundingClientRect();
        expect(settingsRect.bottom).to.be.at.most(previewRect.top);
        expect(Math.abs(settingsRect.left - previewRect.left)).to.be.lessThan(
          2,
        );
      });
    });
    cy.get("[data-cy=standard-block-preview]").should(
      "contain.text",
      "Pause, 30 min",
    );
    cy.get("[data-cy=standard-block-preview]")
      .should("not.contain.text", "Slik blir én intervjublokk")
      .and("not.contain.text", "Intervjutidene hører sammen");
    cy.get("[data-cy=interview-slot]").should("have.length", 4);
    cy.get("[data-cy=layout-result-preview]").should("not.exist");
    cy.contains("Aktive blokker").should("not.exist");
    cy.screenshot("scheduler-workflow/01-foundation-block-fine-tune", {
      capture: "viewport",
    });
  });

  it("updates the block shape immediately when duration, size and pause change", () => {
    mountSettings(30, false, 4, 30);
    const duration = DURATION_PRESETS[0];

    cy.get('[role="radiogroup"][aria-label="Intervjulengde"]')
      .find(`input[type="radio"][value="${duration}"]`)
      .check({ force: true });
    cy.get('[role="group"][aria-label="Antall intervjuer per blokk"]')
      .find('button[aria-label="Øk"]')
      .click();
    cy.get('[role="radiogroup"][aria-label="Pause mellom blokker"]')
      .find('input[type="radio"][value="0"]')
      .check({ force: true });

    cy.get("[data-cy=interview-slot]").should("have.length", 5);
    cy.get("[data-cy=schedule-pause]").should("not.exist");
    cy.get("[data-cy=next-block-time]").should(
      "have.text",
      formatClockMinute(8 * 60 + 5 * duration),
    );
  });

  it("expands and contracts the pause with the shared motion", () => {
    // Sampling real animation frames races the CI machine's actual paint
    // rate: on a starved runner the transition can finish (or, before
    // expandContractMotion.ts disabled GSAP's lag smoothing, barely move)
    // entirely inside whatever gap falls between polling ticks, regardless
    // of how early the poll starts. Cypress can fake Date but not
    // requestAnimationFrame, so from here on GSAP's own ticker is driven
    // by hand through window.__gsapTicker (a Cypress-only hook, see
    // expandContractMotion.ts) against a faked Date.now() - which instant
    // into the transition each check lands on is exact, not a guess about
    // how many real frames happened to run.
    cy.clock(0, ["Date"]);
    mountSettings(0, false, 4, 30);

    cy.get('[role="radiogroup"][aria-label="Pause mellom blokker"]')
      .find('input[type="radio"][value="60"]')
      .check({ force: true });

    // The tween isn't created until this fires: animateExpandedElementOnNextFrame
    // defers the actual gsap.fromTo() call by one requestAnimationFrame,
    // and that part can't be faked away. Waiting for one real frame here
    // is a world apart from racing the full 500ms transition against one.
    cy.window().then(
      (window) =>
        new Cypress.Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        }),
    );

    const tickAndRead = (ms: number) =>
      cy.tick(ms).then(() =>
        cy.window().then((window) => {
          const ticker = (
            window as unknown as { __gsapTicker: { tick: () => void } }
          ).__gsapTicker;
          ticker.tick();
          const pause = window.document.querySelector<HTMLElement>(
            "[data-cy=schedule-pause]",
          );
          if (!pause) {
            throw new Error("schedule-pause missing");
          }
          return {
            pause: Number(window.getComputedStyle(pause).opacity),
          };
        }),
      );

    tickAndRead(80).then((first) => {
      expect(first.pause).to.be.lessThan(0.95);
    });

    tickAndRead(160).then((midway) => {
      expect(midway.pause).to.be.greaterThan(0);
    });

    tickAndRead(260).then((settled) => {
      expect(settled.pause).to.be.closeTo(1, 0.01);
    });

    cy.get("[data-cy=schedule-pause]").should(
      "have.attr",
      "data-motion",
      "expand-contract-down",
    );
  });

  it("keeps the expanded pause height after resizing it", () => {
    mountSettings(30, false, 4, 30);

    cy.get("[data-cy=schedule-pause]").then(($pause) => {
      const initialHeight = $pause[0].getBoundingClientRect().height;

      cy.get('[role="radiogroup"][aria-label="Pause mellom blokker"]')
        .find('input[type="radio"][value="60"]')
        .check({ force: true });
      cy.wait(550);

      cy.get("[data-cy=schedule-pause]").should(($expandedPause) => {
        const expandedHeight = $expandedPause[0].getBoundingClientRect().height;
        expect(expandedHeight).to.be.closeTo(44, 1);
        expect(expandedHeight).to.be.greaterThan(initialHeight);
      });
    });
  });

  it("snaps a short final block in either direction", () => {
    mountSettings(60, false, 4, 30);
    cy.get("[data-cy=block-settings-grid]").then(($settings) => {
      const initialTop = elementTopInDocument($settings[0]);

      cy.get("[data-cy=trim-final-block]").click();
      cy.get("[data-cy=block-settings-grid]").should(($updatedSettings) => {
        expect(elementTopInDocument($updatedSettings[0])).to.be.closeTo(
          initialTop,
          1,
        );
      });
    });
    cy.get("[data-cy=daily-time-value]").should("have.text", "08:00/17:00");
    cy.get("[data-cy=final-block-snap-footer]").should(
      "have.attr",
      "data-motion-state",
      "empty",
    );
    cy.wait(300);
    cy.get("[data-cy=short-final-block-note]").should("not.exist");

    mountSettings(60, false, 4, 30);
    cy.get("[data-cy=final-block-snap-footer]").within(() => {
      cy.get("[data-cy=short-final-block-note]").should(
        "have.attr",
        "aria-label",
        "Siste blokk: 2 av 4 intervjutider",
      );
      cy.get("[data-cy=trim-final-block]").should(
        "have.attr",
        "aria-label",
        "Forkort sluttid til 17:00",
      );
      cy.get("[data-cy=complete-final-block]").should(
        "have.attr",
        "aria-label",
        "Utvid sluttid til 19:00",
      );
    });
    cy.get("[data-cy=trim-final-block]").click();
    cy.get("[data-cy=daily-time-value]").should("have.text", "08:00/17:00");
    cy.wait(300);
    cy.get("[data-cy=short-final-block-note]").should("not.exist");

    mountSettings(60, false, 4, 30);
    cy.get("[data-cy=complete-final-block]").click();
    cy.get("[data-cy=daily-time-value]").should("have.text", "08:00/19:00");
    cy.wait(300);
    cy.get("[data-cy=short-final-block-note]").should("not.exist");
    cy.get("[data-cy=standard-block-preview]").should(
      "not.contain.text",
      "Siste blokk per dag blir kort",
    );
  });

  it("hides final-block snapping when the day ends on a complete block", () => {
    mountSettings(30, false, 4, 30);
    cy.get("[data-cy=short-final-block-note]").should("not.exist");
    cy.get("[data-cy=trim-final-block]").should("not.exist");
    cy.get("[data-cy=complete-final-block]").should("not.exist");
  });

  it("keeps only the cutoff snap when completion would pass midnight", () => {
    mountSettings(60, false, 4, 30);
    cy.get('input[aria-label="Sluttid per dag, time"]').clear().type("23");
    cy.get('input[aria-label="Sluttid per dag, minutt"]').clear().type("30");

    cy.get("[data-cy=short-final-block-note]").should(
      "have.attr",
      "aria-label",
      "Siste blokk: 1 av 4 intervjutider",
    );
    cy.get("[data-cy=trim-final-block]").should(
      "have.attr",
      "aria-label",
      "Forkort sluttid til 23:00",
    );
    cy.get("[data-cy=complete-final-block]").should("not.exist");

    cy.get("[data-cy=trim-final-block]").click();
    cy.get("[data-cy=daily-time-value]").should("have.text", "08:00/23:00");
    cy.wait(300);
    cy.get("[data-cy=short-final-block-note]").should("not.exist");
  });

  it("updates period and daily time without an intermediate save", () => {
    mountSettings();
    chooseInterviewPeriod("2026-07-21", "2026-07-24");
    cy.get("[data-cy=period-value]").should(
      "have.text",
      "2026-07-21/2026-07-24",
    );
    cy.get('input[aria-label="Starttid per dag, time"]').clear().type("9");
    cy.get("[data-cy=daily-time-value]").should("have.text", "09:00/18:00");
    cy.get("[data-cy=save-count]").should("have.text", "0");
  });

  it("stages period changes until they are applied", () => {
    mountSettings();
    cy.get("[data-cy=interview-period-trigger]").as("trigger").click();
    cy.get('[data-calendar-date="2026-07-21"]').click();
    cy.get('[data-calendar-date="2026-07-25"]').click();
    cy.get("[data-cy=period-value]").should(
      "have.text",
      "2026-07-20/2026-07-24",
    );
    cy.contains("button", "Avbryt").click();
    cy.get("[data-cy=period-value]").should(
      "have.text",
      "2026-07-20/2026-07-24",
    );
    cy.get("@trigger").should("be.focused").click();
    cy.get('[data-calendar-date="2026-07-21"]').click();
    cy.get('[data-calendar-date="2026-07-25"]').click();
    cy.get("[data-cy=apply-interview-period]").click();
    cy.get("[data-cy=period-value]").should(
      "have.text",
      "2026-07-21/2026-07-25",
    );
  });

  it("prevents a range longer than 21 days", () => {
    mountSettings();
    cy.get("[data-cy=interview-period-trigger]").click();
    cy.get('[data-calendar-date="2026-07-20"]').click();
    cy.get('button[aria-label="Neste måned"]').click();
    cy.get('[data-calendar-date="2026-08-09"]').should("not.be.disabled");
    cy.get('[data-calendar-date="2026-08-10"]').should("be.disabled");
    cy.get("[data-cy=interview-period-status]").should(
      "contain.text",
      "senest",
    );
    cy.get('[data-calendar-date="2026-08-09"]').click();
    cy.get("[data-cy=apply-interview-period]").click();
    cy.get("[data-cy=period-value]").should(
      "have.text",
      "2026-07-20/2026-08-09",
    );
  });

  it("supports a one-day interview period", () => {
    mountSettings();
    cy.get("[data-cy=interview-period-trigger]").click();
    cy.get('[data-calendar-date="2026-07-20"]').click();
    cy.get('[data-calendar-date="2026-07-20"]').click();
    cy.get("[data-cy=apply-interview-period]").click();
    cy.get("[data-cy=period-value]").should(
      "have.text",
      "2026-07-20/2026-07-20",
    );
    cy.get("[data-cy=interview-period-trigger]").should(
      "contain.text",
      "1 dag",
    );
  });

  it("supports keyboard navigation and escape without committing", () => {
    mountSettings();
    cy.get("[data-cy=interview-period-trigger]").as("trigger").click();
    cy.focused()
      .should("have.attr", "data-calendar-date", "2026-07-20")
      .type("{rightarrow}{enter}");
    cy.focused()
      .should("have.attr", "data-calendar-date", "2026-07-21")
      .type("{rightarrow}{rightarrow}{enter}");
    cy.get("[data-cy=apply-interview-period]").should("not.be.disabled");
    cy.get("[data-cy=interview-period-dialog]").type("{esc}");
    cy.get("[data-cy=period-value]").should(
      "have.text",
      "2026-07-20/2026-07-24",
    );
    cy.get("@trigger").should("be.focused");
  });

  it("supports keyboard selection across month boundaries", () => {
    mountSettings();
    cy.get("[data-cy=interview-period-trigger]").click();
    cy.focused()
      .should("have.attr", "data-calendar-date", "2026-07-20")
      .type("{enter}");
    cy.get('button[aria-label="Neste måned"]').focus().type("{enter}");
    cy.get('[data-calendar-date="2026-08-01"]')
      .should("have.attr", "tabindex", "0")
      .focus();
    Array.from({ length: 8 }).forEach(() => {
      cy.focused().type("{rightarrow}");
    });
    cy.focused()
      .should("have.attr", "data-calendar-date", "2026-08-09")
      .type("{rightarrow}")
      .should("have.attr", "data-calendar-date", "2026-08-09")
      .type("{enter}");
    cy.get("[data-cy=apply-interview-period]").click();
    cy.get("[data-cy=period-value]").should(
      "have.text",
      "2026-07-20/2026-08-09",
    );
  });

  [
    { width: 390, height: 760 },
    { width: 768, height: 300 },
    { width: 1280, height: 760 },
  ].forEach(({ width, height }) => {
    it(`keeps the open period picker inside a ${width}x${height}px viewport`, () => {
      cy.viewport(width, height);
      mountSettings();
      cy.get("[data-cy=interview-period-trigger]").click();
      cy.get("[data-cy=interview-period-dialog]").should(($dialog) => {
        const rect = $dialog[0].getBoundingClientRect();
        expect(rect.left).to.be.at.least(0);
        expect(rect.right).to.be.at.most(width);
        expect(rect.top).to.be.at.least(0);
        expect(rect.bottom).to.be.at.most(height);
      });
      cy.screenshot(`scheduler-workflow/period-picker-${width}x${height}`, {
        capture: "viewport",
      });
    });
  });

  it("supports compact presets and a validated custom duration", () => {
    const presetEnteredAsCustom = DURATION_PRESETS[1];
    const customDuration = 35;
    expect(DURATION_PRESETS).not.to.include(customDuration);
    mountSettings();
    cy.get('[role="radiogroup"][aria-label="Intervjulengde"]')
      .find('input[type="radio"]')
      .should("have.length", 4);
    chooseCustom("Intervjulengde");
    cy.get('input[aria-label="Intervjulengde i minutter"]')
      .clear()
      .type(`${presetEnteredAsCustom}{enter}`);
    cy.get("[data-cy=duration-value]").should(
      "have.text",
      String(presetEnteredAsCustom),
    );
    cy.get("[data-cy=duration-mode]").should("have.text", "preset");

    chooseCustom("Intervjulengde");
    cy.get('input[aria-label="Intervjulengde i minutter"]')
      .clear()
      .type(`${customDuration}{enter}`);
    cy.get("[data-cy=duration-value]").should(
      "have.text",
      String(customDuration),
    );
    cy.get("[data-cy=duration-mode]").should("have.text", "custom");
  });

  it("supports zero pause and a custom pause", () => {
    mountSettings();
    cy.get('[role="radiogroup"][aria-label="Pause mellom blokker"]')
      .find('input[type="radio"][value="0"]')
      .check({ force: true });
    cy.get("[data-cy=committed-value]").should("have.text", "0");

    chooseCustom("Pause mellom blokker");
    cy.get('input[aria-label="Pause mellom blokker i minutter"]')
      .clear()
      .type("45{enter}");
    cy.get("[data-cy=committed-value]").should("have.text", "45");
    cy.get("[data-cy=committed-mode]").should("have.text", "custom");
  });

  it("omits generated configuration metrics", () => {
    cy.viewport(1280, 900);
    mountSettings();
    cy.contains("20 hele blokker, 1 kort sluttblokk").should("not.exist");
    cy.contains("82 åpne intervjutider, 4 manuelle endringer").should(
      "not.exist",
    );
    cy.contains("Se oppsettsdetaljer").should("not.exist");
    cy.contains("Åpne intervjutider").should("not.exist");
    cy.contains("Manuelle justeringer").should("not.exist");

    mountSettings(30, false, 4, 30, true);
    cy.contains("Nye intervjutider blir lagt til når du lagrer.").should(
      "be.visible",
    );
    cy.contains("Ulagrede endringer").should("not.exist");
  });

  [390, 768, 1024].forEach((width) => {
    it(`keeps the result preview inside a ${width}px viewport`, () => {
      cy.viewport(width, 900);
      mountSettings(30, false, 10, 30);
      cy.get("[data-cy=standard-block-preview]").should("be.visible");
      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(width);
      });
    });
  });
});
