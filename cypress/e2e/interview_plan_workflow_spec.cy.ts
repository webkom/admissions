describe("interview plan workflow", () => {
  const templateStorageKey = "admissions:webkom:interview-outreach-template";

  beforeEach(() => {
    cy.viewport(1440, 900);
    cy.env<{ SESSION_ID: string }>(["SESSION_ID"]).then(({ SESSION_ID }) => {
      if (SESSION_ID) cy.setCookie("admissions_sessionid", SESSION_ID);
      else cy.login("webkom");
      cy.visit("/webkom-open/schedule", {
        onBeforeLoad(window) {
          window.localStorage.removeItem(templateStorageKey);
          window.localStorage.setItem("admissions.wizard.admin.v1", "1");
        },
      });
      cy.contains("button", /3\. (Publisering|Gjennomføring)/, {
        timeout: 10000,
      }).click();
    });
  });

  it("separates status from the next outreach action", () => {
    cy.contains("th", "Status").should("be.visible");
    cy.contains("th", "Neste handling").should("be.visible");
    cy.get('[aria-label^="Intervjustatus for "]')
      .should("be.visible")
      .invoke("text")
      .then((statusText) => {
        const status = statusText.trim();
        expect(["Ikke kalt inn", "Kalt inn"]).to.include(status);
        const actionLabel =
          status === "Ikke kalt inn" ? "Send innkalling" : "Send påminnelse";
        cy.contains("button", actionLabel).click();
      });
    cy.contains('[role="menuitem"]', "Åpne SMS-utkast")
      .should("be.visible")
      .and("have.attr", "href")
      .and("match", /^sms:[+\d]+\?body=/);
    cy.contains('[role="menuitem"]', "Åpne e-postutkast").should("not.exist");
  });

  it("provides an SMS-only template with a clear preview", () => {
    cy.contains("summary", "Meldingsmal")
      .as("templateToggle")
      .should("have.attr", "aria-expanded", "false")
      .and("contain", "Rediger")
      .click();
    cy.get("@templateToggle")
      .should("have.attr", "aria-expanded", "true")
      .and("contain", "Lukk");

    cy.contains("Forhåndsvisning").scrollIntoView().should("be.visible");
    cy.contains("torsdag 16. juli 2026 kl. 14:00").should("be.visible");
    cy.contains("Alle variabler er gyldige").should("be.visible");
    cy.contains("Lagret i denne nettleseren").should("be.visible");

    cy.get("#interview-outreach-sms-body")
      .should("be.visible")
      .and("contain.value", "Hei {first_name}! Du er invitert til intervju med")
      .and("not.contain.value", "{committee_name}");
    cy.contains("tegn").should("be.visible");
    cy.get('[aria-label="Forhåndsvisning av SMS"]')
      .should("contain", "denne meldingen")
      .and("not.contain", "denne e-posten");
  });

  it("keeps workflow progress separate from the active step", () => {
    cy.get('nav[aria-label="Steg i intervjuplanleggingen"]').within(() => {
      cy.contains("button", "Grunnlag").should("be.visible");
      cy.contains("button", "Planutkast").should("be.visible");
      cy.get("button").should("have.length", 3);
      cy.get('[role="tab"]').should("not.exist");
    });
  });

  it("keeps availability overview focused on responses and availability", () => {
    cy.get('nav[aria-label="Steg i intervjuplanleggingen"]').within(() => {
      cy.contains("button", "Grunnlag").click();
    });
    cy.get('[role="tablist"][aria-label="Arbeidsområder i Grunnlag"]').within(
      () => {
        cy.contains('[role="tab"]', "Intervjuere og dekning").click();
      },
    );
    cy.contains("Tilgjengelighetsoversikt")
      .scrollIntoView()
      .should("be.visible");
    cy.contains("button", /mangler svar/i)
      .should("be.visible")
      .click();
    cy.contains("Mangler svar").should("be.visible");
    cy.contains("button", "Skjul").click();
    cy.get("#gender-filter").should("not.exist");
    cy.get("#interviewer-highlight").should("not.exist");
    cy.contains("button", "Filtrer og fremhev").click();
    cy.get("#gender-filter").should("be.visible");
    cy.get("#interviewer-highlight").should("be.visible");
    cy.contains(
      "Tallet viser tilgjengelige intervjuere mot panelstørrelsen",
    ).should("be.visible");
    cy.contains("Lav dekning").should("be.visible");
    cy.contains("Full dekning").should("be.visible");
    cy.contains("Stengt").should("be.visible");
    cy.get("[data-schedule-slot-segment]").should("have.length.greaterThan", 0);
    cy.get("#gender-filter").click();
    cy.get('[role="listbox"]').contains('[role="option"]', "Menn").click();
    cy.contains("Viser mannlige intervjuere").should("be.visible");
    cy.get('[role="button"][aria-label*="i paneldekning"]')
      .should("have.length.greaterThan", 0)
      .first()
      .should("have.attr", "aria-label")
      .and("match", /\d+ av \d+ i paneldekning/);
    cy.get('[role="button"][aria-label*="Vis hvem som er tilgjengelige."]')
      .first()
      .click();
    cy.get('[aria-label="Tilgjengelighet for valgt tidsblokk"]').within(() => {
      cy.contains("Hele blokken").should("be.visible");
      cy.contains("Ikke hele blokken").should("be.visible");
      cy.contains("Ikke svart").should("be.visible");
    });
    cy.get('[aria-label="Tilgjengelighet for valgt tidsblokk"]')
      .find('button[aria-label="Lukk detaljer"]')
      .click();
    cy.contains("Vis stengte tider").should("not.exist");
    cy.contains("Svar mottatt").should("be.visible");
    cy.contains("Åpne intervjutider").should("be.visible");
    cy.contains(/Intervjutider med fullt panel/).should("be.visible");
  });

  it("keeps published-plan controls out of the proposal step", () => {
    cy.contains("button", "Planutkast").click();
    cy.contains("Planen er publisert").should("be.visible");
    cy.contains("button", "Åpne intervjuplan").should("be.visible");
    cy.contains("button", "Publiser").should("not.exist");
    cy.contains("button", "Generer på nytt").should("not.exist");
  });

  it("keeps schedule editing in the proposal step", () => {
    cy.contains("button", /Publisering|Gjennomføring/).click();
    cy.contains("button", "Rediger plan").should("not.exist");
    cy.contains("summary", "Flere handlinger").should("be.visible");
  });
});
