export const collectUnhandledRejections = () => {
  const rejections: unknown[] = [];
  cy.window().then((window) => {
    window.addEventListener("unhandledrejection", (event) => {
      event.preventDefault();
      rejections.push(event.reason);
    });
  });
  return cy.wrap(rejections, { log: false });
};
