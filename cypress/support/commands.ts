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

type UserData = {
  sessionid: string;
  csrftoken: string;
};

const sessions: Record<string, UserData> = {
  webkom: {
    sessionid: "rm4i3g0ok3phcy0moqyk09c0ljjnvftd",
    csrftoken: "D9FJfTguk1zQGiZhgXSURh9q3VlAxK4K",
  },
};

Cypress.Commands.add("login", (username) => {
  if (username in sessions) {
    cy.setCookie("sessionid", sessions[username].sessionid);
    cy.setCookie("csrftoken", sessions[username].csrftoken);
  } else {
    throw new Error("Unknown user");
  }
});

Cypress.Commands.add("logout", () => {
  cy.clearCookie("sessionid");
});
