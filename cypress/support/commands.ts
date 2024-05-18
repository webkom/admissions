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
    sessionid: "ln6y4kwaqp3y5mxv1ft19p6or1a018xq",
    csrftoken: "vKaIGVmBwUPuNkZyvFVy0Ep2IH4B0mG4",
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
