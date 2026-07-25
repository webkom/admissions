describe("interview plan workflow", () => {
  const templateStorageKey = "admissions:webkom:interview-outreach-template";

  beforeEach(() => {
    cy.viewport(1440, 900);
    cy.login("webkom").then(() => {
      cy.request("/api/admission/webkom-open/").its("status").should("eq", 200);
      cy.request("/api/admin/admission/webkom-open/schedule/")
        .its("status")
        .should("eq", 200);
      cy.visit("/webkom-open/schedule", {
        onBeforeLoad(window) {
          window.localStorage.removeItem(templateStorageKey);
          window.localStorage.setItem("admissions.wizard.admin.v1", "1");
        },
      });
      cy.get('nav[aria-label="Steg i intervjuplanleggingen"]', {
        timeout: 10000,
      })
        .contains("button", /Publisering|Gjennomføring/)
        .should("be.enabled")
        .click();
    });
  });

  it("separates status from the next outreach action", () => {
    cy.contains("th", "Status").should("be.visible");
    cy.contains("th", "Neste handling").should("be.visible");
    cy.get('[aria-label^="Intervjustatus for "]')
      .first()
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
    cy.get('[aria-label="Forhåndsvisning av SMS"]')
      .should("contain", "kl. 14:00")
      .and("contain", "Webkom");
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
        cy.contains('[role="tab"]', "Tilgjengelighet og dekning").click();
      },
    );
    cy.contains("Tilgjengelighetsoversikt")
      .scrollIntoView()
      .should("be.visible");
    cy.contains("button", "Administrer").should("be.visible").click();
    cy.get('[aria-label="Deltakelse"]')
      .should("be.visible")
      .and("contain", "Mangler svar");
    cy.contains("button", "Skjul").click();
    cy.get("#gender-filter").should("not.exist");
    cy.get("#interviewer-highlight").should("not.exist");
    cy.contains("Panel på").should("not.exist");
    cy.contains("button", "Filtrer og fremhev").click();
    cy.get("#gender-filter").should("be.visible");
    cy.get("#interviewer-highlight").should("be.visible");
    cy.contains("Tilgjengelige blant dem som har svart").should("not.exist");
    cy.get("#gender-filter").click();
    cy.get('[role="listbox"]').contains('[role="option"]', "Menn").click();
    cy.contains("Viser mannlige intervjuere").should("be.visible");
    cy.get('[role="button"][aria-label*="tilgjengelige intervjuere"]')
      .should("have.length.greaterThan", 0)
      .first()
      .should("have.attr", "aria-label")
      .and("match", /\d+ tilgjengelige intervjuere/);
    cy.get('[role="button"][aria-label*="Vis hvem som er tilgjengelige."]')
      .first()
      .click();
    cy.get('[aria-label="Tilgjengelighet for valgt tidsblokk"]').within(() => {
      cy.contains("Hele blokken").should("be.visible");
      cy.contains("Ikke hele blokken").should("be.visible");
      cy.contains("Ikke svart").should("be.visible");
      cy.contains(/\d+\/\d+/).should("not.exist");
      cy.contains("tilgjengelige i minst én av blokkens ordinære tider").should(
        "not.exist",
      );
      cy.contains(/^\d+\s+tilgjengelige?$/).should("not.exist");
    });
    cy.get('[aria-label="Tilgjengelighet for valgt tidsblokk"]')
      .find('button[aria-label="Lukk detaljer"]')
      .click();
    cy.contains("Vis stengte tider").should("not.exist");
    cy.contains(
      "Du kan kontrollere dekningen nå. Planutkastet blir tilgjengelig når alle deltakende intervjuere har svart.",
    ).should("be.visible");
    cy.contains(/\d+ av \d+ har svart/).should("be.visible");
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

  it("moves focus into the published-plan menu and restores it on Escape", () => {
    cy.contains("summary", "Flere handlinger").as("planActionMenu").click();
    cy.contains('[role="menuitem"]', "Eksporter plan").should("be.focused");
    cy.focused().type("{downarrow}");
    cy.contains('[role="menuitem"]', "Lås opp og rediger").should("be.focused");
    cy.focused().type("{esc}");
    cy.get("@planActionMenu").should("be.focused");
    cy.get("@planActionMenu").parent("details").should("not.have.attr", "open");

    cy.get("@planActionMenu").click();
    cy.contains('[role="menuitem"]', "Eksporter plan").click();
    cy.get('[role="dialog"][aria-labelledby="export-chooser-title"]').should(
      "be.visible",
    );
    cy.contains("button", "Apple Calendar / Outlook").should("be.focused");
    cy.focused().type("{esc}");
    cy.get('[role="dialog"][aria-labelledby="export-chooser-title"]').should(
      "not.exist",
    );
    cy.get("@planActionMenu").should("be.focused");
  });
});
