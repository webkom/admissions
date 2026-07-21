const mountPauseControl = (
  initialValue = 60,
  initialIsCustom = false,
  interviewCount = 4,
  interviewDuration = 30,
  reduceMotion = false,
) => {
  cy.visit(
    `http://localhost:5001/static/cypress/fixtures/admin-schedule-settings-popover.html?value=${initialValue}&custom=${initialIsCustom ? "1" : "0"}&count=${interviewCount}&duration=${interviewDuration}`,
    reduceMotion
      ? {
          onBeforeLoad: (window) => {
            Object.defineProperty(window, "matchMedia", {
              configurable: true,
              value: (query: string) => ({
                matches: query === "(prefers-reduced-motion: reduce)",
                media: query,
                onchange: null,
                addListener: () => undefined,
                removeListener: () => undefined,
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
                dispatchEvent: () => false,
              }),
            });
          },
        }
      : undefined,
  );
  cy.get("[data-cy=popover-harness]").should("exist");
};

const chooseCustom = (label: string) =>
  cy
    .get(`[role="radiogroup"][aria-label="${label}"]`)
    .find('input[type="radio"][value="custom"]')
    .then(($input) => {
      if ($input.is(":checked")) {
        cy.wrap($input).parent().click({ force: true });
        return;
      }
      cy.wrap($input).check({ force: true });
    });

const chooseCustomPause = () => chooseCustom("Pause mellom blokker");

describe("inline custom schedule controls", () => {
  it("uses the simplified planning hierarchy", () => {
    mountPauseControl(30);

    cy.contains("Intervjuvindu").should("not.exist");
    cy.contains("Blokkoppsett").should("not.exist");
    cy.contains("Intervjuperiode").should("be.visible");
    cy.contains("Daglig tidsrom").should("be.visible");
    cy.contains("Intervjulengde").should("be.visible");
    cy.contains("Pause mellom blokker").should("be.visible");
    cy.contains("Standardblokk").should("be.visible");
    cy.contains("Samme blokk vises som en rød rute").should("not.exist");
    cy.contains(
      "Hver del er én intervjutid. Pausen ligger mellom blokkene før mønsteret gjentas.",
    ).should("not.exist");
    cy.contains(/^Innstillinger$/).should("not.exist");
    cy.contains(/^Resultat$/).should("not.exist");
    cy.contains("Maksimal kapasitet").should("not.exist");
    cy.contains("Før stengte blokker").should("not.exist");
    cy.contains("4 intervjuer · 2 t").should("not.exist");
    cy.contains("Neste blokk 10:30").should("be.visible");
  });

  it("updates period and daily time immediately without saving", () => {
    mountPauseControl(30);

    cy.get('input[aria-label="Startdato for intervjuperioden"]')
      .clear()
      .type("2026-07-21");
    cy.get("[data-cy=period-value]").should(
      "have.text",
      "2026-07-21/2026-07-24",
    );
    cy.get('button[aria-label="Bekreft intervjuperiode"]').should("not.exist");

    cy.get('input[aria-label="Starttid per dag, time"]').clear().type("9");
    cy.get("[data-cy=daily-time-value]").should("have.text", "09:00/18:00");
    cy.get('button[aria-label="Bekreft daglig tidsrom"]').should("not.exist");

    cy.get("[data-cy=save-count]").should("have.text", "0");
    cy.contains("button", "Lagre tidsrammer").click();
    cy.get("[data-cy=save-count]").should("have.text", "1");
    cy.contains("button", "Rediger tidsrammer").should("be.visible");
    cy.contains("21.07.2026–24.07.2026").should("be.visible");
    cy.contains("09:00–18:00").should("be.visible");
    cy.contains("button", "Lagre tidsrammer").should("not.exist");

    cy.contains("button", "Rediger tidsrammer").click();
    cy.get('input[aria-label="Startdato for intervjuperioden"]').should(
      "have.value",
      "2026-07-21",
    );
    cy.contains("button", "Lagre tidsrammer").should("be.visible");
  });

  it("deduplicates preset durations and replaces the previous custom value", () => {
    mountPauseControl();

    cy.get('[role="radiogroup"][aria-label="Intervjulengde"]').within(() => {
      cy.get('input[type="radio"]').then(($inputs) => {
        const values = [...$inputs].map((input) => input.value);
        expect(new Set(values).size).to.equal(values.length);
        expect(values.filter((value) => value === "custom")).to.have.length(1);
      });
    });
    chooseCustom("Intervjulengde");
    cy.get('input[aria-label="Intervjulengde i minutter"]')
      .clear()
      .type("50{enter}");
    cy.get("[data-cy=duration-value]").should("have.text", "50");
    cy.get("[data-cy=duration-mode]").should("have.text", "custom");

    chooseCustom("Intervjulengde");
    cy.get('input[aria-label="Intervjulengde i minutter"]')
      .clear()
      .type("50{enter}");
    chooseCustom("Intervjulengde");
    cy.get('input[aria-label="Intervjulengde i minutter"]')
      .clear()
      .type("30{enter}");
    cy.get("[data-cy=duration-value]").should("have.text", "30");
    cy.get("[data-cy=duration-mode]").should("have.text", "preset");
    chooseCustom("Intervjulengde");
    cy.get('input[aria-label="Intervjulengde i minutter"]')
      .clear()
      .type("45{enter}");
    cy.get("[data-cy=duration-value]").should("have.text", "45");
    cy.get("[data-cy=duration-mode]").should("have.text", "preset");
  });

  it("prefills and selects the committed value, then escapes without committing", () => {
    mountPauseControl();
    chooseCustomPause();

    cy.get('[role="radiogroup"][aria-label="Pause mellom blokker"]')
      .find('input[type="radio"]:checked')
      .should("have.length", 1)
      .and("have.value", "custom");

    cy.get('input[aria-label="Pause mellom blokker i minutter"]')
      .should("have.value", "60")
      .and("have.focus")
      .then(($input) => {
        const input = $input[0] as HTMLInputElement;
        expect(input.selectionStart).to.equal(0);
        expect(input.selectionEnd).to.equal(2);
      })
      .clear()
      .type("50");

    cy.get("[data-cy=committed-value]").should("have.text", "60");
    cy.get('input[aria-label="Pause mellom blokker i minutter"]').type("{esc}");
    cy.get("[data-cy=committed-value]").should("have.text", "60");
    cy.get('input[aria-label="Pause mellom blokker i minutter"]').should(
      "not.exist",
    );
  });

  it("applies with Enter and normalises values that match presets", () => {
    mountPauseControl();
    chooseCustomPause();

    cy.get('input[aria-label="Pause mellom blokker i minutter"]')
      .clear()
      .type("50{enter}");
    cy.get("[data-cy=committed-value]").should("have.text", "50");
    cy.get("[data-cy=committed-mode]").should("have.text", "custom");

    chooseCustomPause();
    cy.get('input[aria-label="Pause mellom blokker i minutter"]')
      .clear()
      .type("30{enter}");
    cy.get("[data-cy=committed-value]").should("have.text", "30");
    cy.get("[data-cy=committed-mode]").should("have.text", "preset");
  });

  it("applies a valid egendefinert value on blur", () => {
    mountPauseControl();
    chooseCustomPause();

    cy.get('input[aria-label="Pause mellom blokker i minutter"]')
      .clear()
      .type("50")
      .blur();

    cy.get("[data-cy=committed-value]").should("have.text", "50");
    cy.get("[data-cy=committed-mode]").should("have.text", "custom");
    cy.get('input[aria-label="Pause mellom blokker i minutter"]').should(
      "not.exist",
    );
  });

  it("applies an egendefinert value with the explicit check", () => {
    mountPauseControl();

    cy.get('[role="radiogroup"][aria-label="Pause mellom blokker"]')
      .find('input[type="radio"][value="custom"]')
      .parent()
      .should("have.class", "bg-transparent")
      .and("have.class", "text-text-muted");
    chooseCustomPause();

    cy.get('button[aria-label="Bekreft egendefinert pause mellom blokker"]')
      .should("be.visible")
      .and("have.attr", "aria-hidden", "false")
      .and("be.enabled")
      .and("have.class", "bg-surface-base")
      .and("have.class", "text-text-primary");
    cy.get('input[aria-label="Pause mellom blokker i minutter"]').clear();
    cy.get('button[aria-label="Bekreft egendefinert pause mellom blokker"]')
      .should("be.visible")
      .and("be.disabled")
      .and("have.class", "text-text-primary");
    cy.get('input[aria-label="Pause mellom blokker i minutter"]').type("50");
    cy.get("[data-cy=committed-value]").should("have.text", "60");
    cy.get('button[aria-label="Bekreft egendefinert pause mellom blokker"]')
      .should("be.enabled")
      .and("have.class", "text-text-primary")
      .click();

    cy.get("[data-cy=committed-value]").should("have.text", "50");
    cy.get("[data-cy=committed-mode]").should("have.text", "custom");
    cy.get("[data-cy=save-count]").should("have.text", "0");
    cy.get('input[aria-label="Pause mellom blokker i minutter"]').should(
      "not.exist",
    );
  });

  it("explains the five-minute step for invalid durations", () => {
    mountPauseControl();
    chooseCustom("Intervjulengde");

    cy.get('input[aria-label="Intervjulengde i minutter"]')
      .clear()
      .type("31")
      .blur();

    cy.contains("Skriv inn et helt antall fra 5 til 240 i steg på 5.").should(
      "be.visible",
    );
    cy.get("[data-cy=duration-value]").should("have.text", "30");
    cy.get("[data-cy=duration-mode]").should("have.text", "preset");
  });

  it("keeps invalid values local until corrected", () => {
    mountPauseControl();
    chooseCustomPause();
    cy.get('input[aria-label="Pause mellom blokker i minutter"]')
      .clear()
      .type("241");
    cy.get(
      'button[aria-label="Bekreft egendefinert pause mellom blokker"]',
    ).should("be.disabled");
    cy.get('input[aria-label="Pause mellom blokker i minutter"]').blur();
    cy.contains("Skriv inn et helt antall fra 0 til 240.").should("be.visible");
    cy.get("[data-cy=committed-value]").should("have.text", "60");

    cy.get('input[aria-label="Pause mellom blokker i minutter"]').type("{esc}");
    cy.get('input[aria-label="Pause mellom blokker i minutter"]').should(
      "not.exist",
    );
    cy.get("[data-cy=committed-value]").should("have.text", "60");
  });

  it("exposes zero as the explicit no-pause preset", () => {
    mountPauseControl();
    cy.get('[role="radiogroup"][aria-label="Pause mellom blokker"]')
      .find('input[type="radio"][value="0"]')
      .check({ force: true });

    cy.get("[data-cy=committed-value]").should("have.text", "0");
    cy.get("[data-cy=committed-mode]").should("have.text", "preset");
  });

  it("animates the pause into and out of the proportional block track", () => {
    mountPauseControl(0);

    cy.get('[role="radiogroup"][aria-label="Pause mellom blokker"]')
      .find('input[type="radio"][value="30"]')
      .check({ force: true });
    cy.get("[data-cy=schedule-pause]")
      .should("exist")
      .and("have.attr", "aria-hidden", "true");
    cy.get("[data-cy=standard-block-preview] figure").then(($figure) => {
      cy.get(`[id="${$figure.attr("aria-describedby")}"]`)
        .should("contain.text", "pause på 30 minutter")
        .and("contain.text", "Neste blokk starter 10:30");
    });
    cy.wait(320);
    cy.get("[data-cy=schedule-pause]").should(($pause) => {
      expect(getComputedStyle($pause[0]).opacity).to.equal("1");
      expect(Number(getComputedStyle($pause[0]).flexGrow)).to.equal(30);
    });

    cy.get('[role="radiogroup"][aria-label="Pause mellom blokker"]')
      .find('input[type="radio"][value="0"]')
      .check({ force: true });
    cy.get("[data-cy=schedule-pause]")
      .should("exist")
      .and("have.attr", "data-exiting", "true")
      .and("have.attr", "aria-hidden", "true");
    cy.get("[data-cy=standard-block-preview] figure").then(($figure) => {
      cy.get(`[id="${$figure.attr("aria-describedby")}"]`)
        .should("contain.text", "Det er ingen pause mellom blokkene")
        .and("contain.text", "Neste blokk starter 10:00");
    });
    cy.wait(320);
    cy.get("[data-cy=schedule-pause]").should("not.exist");
  });

  it("settles rapid pause changes without leaving a ghost segment", () => {
    mountPauseControl(0);

    cy.get('[role="radiogroup"][aria-label="Pause mellom blokker"]')
      .find('input[type="radio"][value="30"]')
      .check({ force: true });
    cy.get('[role="radiogroup"][aria-label="Pause mellom blokker"]')
      .find('input[type="radio"][value="0"]')
      .check({ force: true });

    cy.wait(350);
    cy.get("[data-cy=schedule-pause]").should("not.exist");
    cy.get("[data-cy=standard-block-preview]").should(
      "contain.text",
      "Neste blokk 10:00",
    );
  });

  it("restores a pause that is reselected during its exit", () => {
    mountPauseControl(30);

    cy.get('[role="radiogroup"][aria-label="Pause mellom blokker"]')
      .find('input[type="radio"][value="0"]')
      .check({ force: true });
    cy.get('[role="radiogroup"][aria-label="Pause mellom blokker"]')
      .find('input[type="radio"][value="30"]')
      .check({ force: true });

    cy.wait(320);
    cy.get("[data-cy=schedule-pause]").should(($pause) => {
      expect(getComputedStyle($pause[0]).visibility).not.to.equal("hidden");
      expect(getComputedStyle($pause[0]).opacity).to.equal("1");
      expect(Number(getComputedStyle($pause[0]).flexGrow)).to.equal(30);
    });
    cy.get("[data-cy=standard-block-preview]").should(
      "contain.text",
      "Neste blokk 10:30",
    );
  });

  it("keeps the repeating preview explicit without a pause", () => {
    mountPauseControl(0);

    cy.get("[data-cy=standard-block-preview] figure").then(($figure) => {
      expect($figure).to.have.attr("aria-describedby");
      cy.get(`[id="${$figure.attr("aria-describedby")}"]`).should(
        "contain.text",
        "Det er ingen pause mellom blokkene",
      );
    });
    cy.get("[data-cy=schedule-pause]").should("not.exist");
    cy.get("[data-cy=schedule-continuation]").should("be.visible");
    cy.contains("4 × 30 min").should("not.exist");
  });

  it("renders one open-block shell with appointments and an external pause", () => {
    mountPauseControl(30, false, 4, 60);

    cy.get("[data-cy=interview-block-shell]")
      .should("have.class", "border-brand-activeBorder")
      .and("have.class", "bg-brand-tint")
      .find("[data-cy=interview-slot]")
      .should("have.length", 4);
    cy.get("[data-cy=interview-block-shell]")
      .find("[data-cy=schedule-pause]")
      .should("not.exist");
    cy.get("[data-cy=standard-block-timed-layout]")
      .find("[data-cy=schedule-pause]")
      .should("have.length", 1);
    cy.get("[data-cy=standard-block-timed-layout]")
      .find("[data-cy=schedule-continuation]")
      .should("not.exist");
    cy.get("[data-cy=schedule-continuation]")
      .should("be.visible")
      .and("not.have.class", "transition-[flex-grow]");
  });

  it("exposes a complete description while keeping the figure non-interactive", () => {
    mountPauseControl(30, false, 4, 60);

    cy.get("[data-cy=standard-block-preview] figure").within(() => {
      cy.get("button, input, a, [tabindex='0']").should("not.exist");
      cy.get("[data-cy=interview-slot]").should(
        "have.attr",
        "aria-hidden",
        "true",
      );
      cy.get("[data-cy=schedule-pause]").should(
        "have.attr",
        "aria-hidden",
        "true",
      );
    });
    cy.get("[data-cy=standard-block-preview] figure").then(($figure) => {
      cy.get(`[id="${$figure.attr("aria-describedby")}"]`)
        .should("contain.text", "Standardblokk fra 08:00 til 12:00")
        .and("contain.text", "intervju 4 går fra 11:00 til 12:00")
        .and("contain.text", "pause på 30 minutter")
        .and("contain.text", "Neste blokk starter 12:30");
    });
  });

  it("expands the proportional track without transforming inner boxes", () => {
    mountPauseControl(30, false, 4, 30);

    cy.get('[data-layout-id="interview-1"]').then(($firstInterview) => {
      cy.get('[role="radiogroup"][aria-label="Intervjulengde"]')
        .find('input[type="radio"][value="45"]')
        .check({ force: true });
      cy.get('[data-layout-id="interview-1"]').should(($updatedInterview) => {
        expect($updatedInterview[0]).to.equal($firstInterview[0]);
      });
      cy.get('[data-layout-id="interview-1"]').then(($updatedInterview) => {
        expect(getComputedStyle($updatedInterview[0]).transform).to.equal(
          "none",
        );
      });
    });
    cy.get('[data-layout-id="interview-1"]').should("exist");
    cy.get('[data-layout-id="pause"]').should("exist");
    cy.get('[role="group"][aria-label="Antall intervjuer per blokk"]')
      .find('button[aria-label="Øk"]')
      .click();
    cy.get('[data-layout-id="interview-5"]').should("exist");
    cy.get('[role="group"][aria-label="Antall intervjuer per blokk"]')
      .find('button[aria-label="Reduser"]')
      .click();
    cy.get('[data-layout-id="interview-5"]').should("not.exist");
    cy.get('[data-layout-id="interview-1"]').should("exist");
    cy.get("[data-cy=standard-block-preview]").should(
      "contain.text",
      "Neste blokk 11:30",
    );
    cy.get("[data-cy=interview-block-shell], [data-cy=schedule-pause]").each(
      ($segment) => {
        expect(getComputedStyle($segment[0]).transform).to.equal("none");
        expect(getComputedStyle($segment[0]).opacity).to.equal("1");
      },
    );
  });

  it("applies the final pause state immediately with reduced motion", () => {
    mountPauseControl(30, false, 4, 30, true);
    cy.get('[role="radiogroup"][aria-label="Pause mellom blokker"]')
      .find('input[type="radio"][value="0"]')
      .check({ force: true });
    cy.get("[data-cy=standard-block-preview]")
      .should("contain.text", "08:00–10:00")
      .and("contain.text", "Neste blokk 10:00");
    cy.get("[data-cy=schedule-pause]").should("not.exist");
    cy.get("[data-cy=interview-block-shell]").should(($segment) => {
      expect($segment.attr("style") ?? "").not.to.contain("transform");
    });
  });

  [390, 768, 1024].forEach((width) => {
    it(`keeps a large block within the viewport at ${width}px`, () => {
      cy.viewport(width, 900);
      mountPauseControl(30, false, 10);

      cy.get("[data-cy=standard-block-preview]").should("be.visible");
      if (width === 390) {
        cy.get("[data-cy=standard-block-preview]").should(
          "have.attr",
          "data-density",
          "narrow",
        );
        cy.get("[data-cy=interview-slot]").first().should("have.text", "1");
        cy.get("[data-cy=interview-slot]").last().should("have.text", "10");
      }
      if (width === 768) {
        cy.get(
          '[role="radiogroup"][aria-label="Intervjulengde"], [role="radiogroup"][aria-label="Pause mellom blokker"]',
        ).each(($control) => {
          expect($control[0].getBoundingClientRect().width).to.be.greaterThan(
            width * 0.7,
          );
        });
      }
      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(width);
      });
    });
  });

  it("keeps short pauses proportional on mobile", () => {
    cy.viewport(390, 900);
    mountPauseControl(5, true, 10, 30);

    cy.get("[data-cy=interview-block-shell]").then(($block) => {
      cy.get("[data-cy=schedule-pause]").then(($pause) => {
        const blockWidth = $block[0].getBoundingClientRect().width;
        const pauseWidth = $pause[0].getBoundingClientRect().width;
        expect(pauseWidth / blockWidth).to.be.lessThan(0.04);
      });
    });
  });
});
