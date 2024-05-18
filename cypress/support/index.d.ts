/// <reference types="cypress" />

declare namespace Cypress {
  interface Chainable {
    login(username: string): Chainable<void>;
    logout(): Chainable<void>;
  }
}
