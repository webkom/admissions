/// <reference types="cypress" />
// ***********************************************
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
//
// declare global {
//   namespace Cypress {
//     interface Chainable {
//       login(email: string, password: string): Chainable<void>
//       drag(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       dismiss(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       visit(originalFn: CommandOriginalFn, url: string, options: Partial<VisitOptions>): Chainable<Element>
//     }
//   }
// }

type FixtureCredentials = {
  username: string;
  password: string;
};

const credentialsFile = ".cypress-fixture-credentials.json";
const csrfInputPattern =
  /name=["']csrfmiddlewaretoken["'][^>]*value=["']([^"']+)["']/;

Cypress.Commands.add("login", (username) => {
  cy.readFile<FixtureCredentials>(credentialsFile, { log: false }).then(
    (credentials) => {
      if (username !== credentials.username) {
        throw new Error(`Unknown Cypress fixture user: ${username}`);
      }
      cy.request({ url: "/api-auth/login/", log: false }).then((response) => {
        const csrfToken = csrfInputPattern.exec(String(response.body))?.[1];
        if (!csrfToken) {
          throw new Error("Cypress login could not read Django's CSRF token.");
        }
        cy.request({
          method: "POST",
          url: "/api-auth/login/",
          form: true,
          followRedirect: false,
          log: false,
          body: {
            csrfmiddlewaretoken: csrfToken,
            username: credentials.username,
            password: credentials.password,
            next: "/",
          },
        }).then((loginResponse) => {
          // Django re-renders the login form with 200 when credentials are
          // rejected, so a bare status assertion reads "expected 200 to equal
          // 302" and says nothing about the cause. In practice the cause is
          // almost always that .cypress-fixture-credentials.json belongs to a
          // database that has since been recreated.
          expect(
            loginResponse.status,
            `Cypress could not log in as "${credentials.username}". The fixture ` +
              `credentials do not match the database — run \`make cypress_fixtures\` ` +
              `against the database the dev server is using, then retry`,
          ).to.eq(302);
        });
      });
    },
  );
});

Cypress.Commands.add("logout", () => {
  cy.request({
    url: "/logout/",
    followRedirect: false,
    failOnStatusCode: false,
    log: false,
  });
  cy.clearCookies({ log: false });
});
