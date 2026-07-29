import { DateTime } from "luxon";
import { createDefaultAdmissionDates } from "../../frontend/src/routes/ManageAdmissions/admissionDateDefaults";

const mountPicker = (query = "") => {
  cy.visit(
    `http://localhost:5001/static/cypress/fixtures/admission-datetime-picker.html${query}`,
  );
  cy.get("[data-cy=datetime-harness]").should("exist");
};

const navigateToMonth = (date: string) => {
  const [targetYear, targetMonth] = date.split("-").map(Number);
  cy.get('[data-cy="date-dialog-open_from"]')
    .invoke("attr", "data-displayed-month")
    .then((displayedMonth) => {
      const [displayedYear, displayedMonthNumber] = String(displayedMonth)
        .split("-")
        .map(Number);
      const monthOffset =
        (targetYear - displayedYear) * 12 + targetMonth - displayedMonthNumber;
      const navigationLabel =
        monthOffset >= 0 ? "Neste måned" : "Forrige måned";
      Cypress._.times(Math.abs(monthOffset), () => {
        cy.get('[data-cy="date-dialog-open_from"]')
          .find(`button[aria-label="${navigationLabel}"]`)
          .click();
      });
    });
};

describe("admission date and time fields", () => {
  it("keeps date and time visible as separate controls", () => {
    mountPicker();

    cy.contains("Alle tider vises i norsk tid.").should("be.visible");
    cy.get('input[type="datetime-local"]').should("not.exist");
    cy.get('[data-cy="datetime-control-open_from"]').within(() => {
      cy.contains("Dato").should("be.visible");
      cy.contains("Klokkeslett").should("be.visible");
      cy.get("#open_from").should("contain", "17. juli 2026");
      cy.get("#open_from-time").should("have.value", "13:12");
    });
  });

  it("uses real opening and closing defaults for a new admission", () => {
    const values = createDefaultAdmissionDates();
    const opening = DateTime.fromISO(values.open_from, {
      zone: "Europe/Oslo",
    });
    const deadline = DateTime.fromISO(values.public_deadline, {
      zone: "Europe/Oslo",
    });
    const closing = DateTime.fromISO(values.closed_from, {
      zone: "Europe/Oslo",
    });

    expect(values.open_from).to.match(/T12:00:00$/);
    expect(values.public_deadline).to.match(/T23:59:00$/);
    expect(values.closed_from).to.match(/T23:59:00$/);
    expect(opening.weekday).to.equal(1);
    expect(
      deadline.startOf("day").diff(opening.startOf("day"), "days").days,
    ).to.equal(6);
    expect(
      closing.startOf("day").diff(opening.startOf("day"), "days").days,
    ).to.equal(13);
    expect(values.open_from < values.public_deadline).to.equal(true);
    expect(values.public_deadline < values.closed_from).to.equal(true);
  });

  it("opens a focused date-only calendar without nested form actions", () => {
    mountPicker();
    cy.get("#open_from").click();

    cy.get('[data-cy="date-dialog-open_from"]')
      .should("be.visible")
      .within(() => {
        cy.contains("Dato og klokkeslett").should("not.exist");
        cy.contains("Opptaket åpner").should("not.exist");
        cy.contains("Norsk tid").should("not.exist");
        cy.contains("Avbryt").should("not.exist");
        cy.contains("Bruk tidspunkt").should("not.exist");
        cy.contains("I dag").should("be.visible");
        cy.get('[data-calendar-date="2026-08-03"]').should("not.exist");
      })
      .then(($dialog) => {
        expect($dialog[0].scrollHeight).to.equal($dialog[0].clientHeight);
      });
  });

  it("keeps the desktop calendar on its opening side while browsing from a short to a long month", () => {
    cy.viewport(1280, 1000);
    mountPicker("?offset=424");
    cy.get("#open_from").click();

    let initialSide: "above" | "below" | undefined;
    cy.get('[data-cy="date-dialog-open_from"]').then(($dialog) => {
      initialSide = $dialog[0].style.bottom ? "above" : "below";
    });

    cy.get('[data-cy="date-dialog-open_from"]')
      .find('button[aria-label="Neste måned"]')
      .click();

    cy.get('[data-cy="date-dialog-open_from"]')
      .should("have.attr", "data-displayed-month", "2026-08")
      .then(($dialog) => {
        const currentSide = $dialog[0].style.bottom ? "above" : "below";
        expect(currentSide).to.equal(initialSide);
        const rect = $dialog[0].getBoundingClientRect();
        const viewportHeight =
          $dialog[0].ownerDocument.defaultView?.innerHeight ?? 0;
        expect(rect.top).to.be.at.least(0);
        expect(rect.bottom).to.be.at.most(viewportHeight);
      });
  });

  it("commits a selected date immediately and closes the calendar", () => {
    mountPicker();
    cy.get("#open_from").click();
    navigateToMonth("2026-08-03");
    cy.get('[data-calendar-date="2026-08-03"]').click();

    cy.get('[data-cy="date-dialog-open_from"]').should("not.exist");
    cy.get("[data-cy=committed-datetime]").should(
      "have.text",
      "2026-08-03T13:12:00",
    );
    cy.get("#open_from").should("contain", "3. august 2026");
    cy.get("#open_from").should("be.focused");
  });

  [
    ["8", "08:00"],
    ["800", "08:00"],
    ["0830", "08:30"],
    ["8:30", "08:30"],
    ["13:07", "13:07"],
  ].forEach(([entered, normalized]) => {
    it(`normalizes ${entered} to ${normalized}`, () => {
      mountPicker();
      cy.get("#open_from-time").clear().type(entered).blur();

      cy.get("#open_from-time").should("have.value", normalized);
      cy.get("[data-cy=committed-datetime]").should(
        "have.text",
        `2026-07-17T${normalized}:00`,
      );
    });
  });

  it("steps time by 15 minutes with the arrow keys", () => {
    mountPicker();
    cy.get("#open_from-time")
      .focus()
      .type("{uparrow}")
      .should("have.value", "13:27")
      .type("{downarrow}")
      .should("have.value", "13:12");
  });

  it("keeps an incomplete value empty until both date and time are valid", () => {
    mountPicker("?value=");
    cy.get("#open_from").should("contain", "Ikke valgt").click();
    navigateToMonth("2026-07-28");
    cy.get('[data-calendar-date="2026-07-28"]').click();

    cy.get("[data-cy=committed-datetime]").should("have.text", "");
    cy.get("#open_from-time").should("have.value", "");
    cy.get("#open_from-time").type("8").blur();
    cy.get("[data-cy=committed-datetime]").should(
      "have.text",
      "2026-07-28T08:00:00",
    );
  });

  it("shows the configured time placeholder and selects existing time on click", () => {
    mountPicker("?value=");
    cy.get("#open_from-time").should("have.attr", "placeholder", "12:00");

    mountPicker("?value=&placeholder=2026-07-20T23%3A59%3A00");
    cy.get("#open_from-time").should("have.attr", "placeholder", "23:59");

    mountPicker();
    cy.get("#open_from-time")
      .click("left")
      .then(($input) => {
        const input = $input[0] as HTMLInputElement;
        expect(input.selectionStart).to.equal(0);
        expect(input.selectionEnd).to.equal(2);
      })
      .type("8")
      .blur()
      .should("have.value", "08:12");

    mountPicker();
    cy.get("#open_from-time")
      .click("right")
      .then(($input) => {
        const input = $input[0] as HTMLInputElement;
        expect(input.selectionStart).to.equal(3);
        expect(input.selectionEnd).to.equal(5);
      });
  });

  it("enforces a strictly later public deadline", () => {
    mountPicker("?value=&min=2026-07-20T14%3A30%3A00&exclusive=1");
    cy.get("#open_from").click();
    navigateToMonth("2026-07-20");
    cy.get('[data-calendar-date="2026-07-20"]').click();
    cy.get("#open_from-time").type("1430").blur();

    cy.get("[data-cy=committed-datetime]").should("have.text", "");
    cy.get('[role="alert"]').should("contain", "må være etter");
    cy.get("#open_from-time").clear().type("1431").blur();
    cy.get("[data-cy=committed-datetime]").should(
      "have.text",
      "2026-07-20T14:31:00",
    );
  });

  it("allows a closing time equal to the public deadline", () => {
    mountPicker("?value=&min=2026-07-20T14%3A30%3A00");
    cy.get("#open_from").click();
    navigateToMonth("2026-07-20");
    cy.get('[data-calendar-date="2026-07-20"]').click();
    cy.get("#open_from-time").type("1430").blur();

    cy.get("[data-cy=committed-datetime]").should(
      "have.text",
      "2026-07-20T14:30:00",
    );
  });

  it("rejects local times that do not exist during Oslo spring-forward", () => {
    mountPicker("?value=");
    cy.get("#open_from").click();
    navigateToMonth("2026-03-29");
    cy.get('[data-calendar-date="2026-03-29"]').click();
    cy.get("#open_from-time").type("230").blur();

    cy.get("[data-cy=committed-datetime]").should("have.text", "");
    cy.get('[role="alert"]').should("contain", "overgang til sommertid");
    cy.get("#open_from-time").clear().type("330").blur();
    cy.get("[data-cy=committed-datetime]").should(
      "have.text",
      "2026-03-29T03:30:00",
    );
  });

  it("rejects ambiguous local times during Oslo autumn fallback", () => {
    mountPicker("?value=");
    cy.get("#open_from").click();
    navigateToMonth("2026-10-25");
    cy.get('[data-calendar-date="2026-10-25"]').click();
    cy.get("#open_from-time").type("230").blur();

    cy.get("[data-cy=committed-datetime]").should("have.text", "");
    cy.get('[role="alert"]').should("contain", "tvetydig");
    cy.get("#open_from-time").clear().type("330").blur();
    cy.get("[data-cy=committed-datetime]").should(
      "have.text",
      "2026-10-25T03:30:00",
    );
  });

  it("supports keyboard date selection and escape", () => {
    mountPicker();
    cy.get("#open_from").click();
    cy.get('[data-calendar-date="2026-07-17"]').focus().type("{pagedown}");
    cy.focused()
      .should("have.attr", "data-calendar-date", "2026-08-17")
      .type("{enter}");
    cy.get("[data-cy=committed-datetime]").should(
      "have.text",
      "2026-08-17T13:12:00",
    );

    cy.get("#open_from").click();
    cy.focused().type("{rightarrow}");
    cy.focused().type("{esc}");
    cy.get("#open_from").should("be.focused");
    cy.get("[data-cy=committed-datetime]").should(
      "have.text",
      "2026-08-17T13:12:00",
    );
  });

  it("keeps rapid keyboard navigation cumulative", () => {
    mountPicker("?value=2026-08-01T13%3A12%3A00");
    cy.get("#open_from").click();
    cy.focused()
      .should("have.attr", "data-calendar-date", "2026-08-01")
      .type("{rightarrow}".repeat(8), { delay: 0 });
    cy.get(
      '[data-cy="date-dialog-open_from"] [data-calendar-date][tabindex="0"]',
    ).should("have.length", 1);
    cy.focused()
      .should("have.attr", "data-calendar-date", "2026-08-09")
      .type("{enter}");
    cy.get("[data-cy=committed-datetime]").should(
      "have.text",
      "2026-08-09T13:12:00",
    );
  });

  it("continues from the clamped minimum during keyboard input", () => {
    mountPicker("?value=2026-07-20T14%3A30%3A00&min=2026-07-20T14%3A30%3A00");
    cy.get("#open_from").click();
    cy.focused()
      .should("have.attr", "data-calendar-date", "2026-07-20")
      .type("{leftarrow}");
    cy.focused()
      .should("have.attr", "data-calendar-date", "2026-07-20")
      .type("{rightarrow}");
    cy.focused().should("have.attr", "data-calendar-date", "2026-07-21");
  });

  it("clamps keyboard month movement to the target month's last day", () => {
    mountPicker("?value=2026-01-31T13%3A12%3A00");
    cy.get("#open_from").click();
    cy.get('[data-calendar-date="2026-01-31"]').focus().type("{pagedown}");
    cy.focused().should("have.attr", "data-calendar-date", "2026-02-28");
    cy.focused().type("{esc}");

    mountPicker("?value=2026-03-31T13%3A12%3A00");
    cy.get("#open_from").click();
    cy.get('[data-calendar-date="2026-03-31"]').focus().type("{pageup}");
    cy.focused().should("have.attr", "data-calendar-date", "2026-02-28");
  });

  [
    { width: 390, height: 760, name: "mobile" },
    { width: 768, height: 300, name: "short" },
    { width: 1280, height: 760, name: "desktop" },
  ].forEach(({ width, height, name }) => {
    it(`keeps the date calendar inside the ${name} viewport without scrolling`, () => {
      cy.viewport(width, height);
      mountPicker();
      cy.get("#open_from").click();
      cy.get('[data-cy="date-dialog-open_from"]').then(($dialog) => {
        const rect = $dialog[0].getBoundingClientRect();
        expect(rect.left).to.be.at.least(0);
        expect(rect.top).to.be.at.least(0);
        expect(rect.right).to.be.at.most(width);
        expect(rect.bottom).to.be.at.most(height);
        expect($dialog[0].scrollHeight).to.equal($dialog[0].clientHeight);
      });
      cy.screenshot(`admission-date-time-fields/${name}`, {
        capture: "viewport",
      });
    });
  });
});
