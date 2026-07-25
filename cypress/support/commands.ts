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
          expect(loginResponse.status).to.eq(302);
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
