/// <reference types="cypress" />

declare namespace Cypress {
  interface Chainable {
    clearDb(): Chainable<void>;
  }
}
