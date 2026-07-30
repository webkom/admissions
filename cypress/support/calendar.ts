export const calendarDate = (isoDate: string) =>
  cy.get(`[data-calendar-date="${isoDate}"]`);

export const clickCalendarDates = (...isoDates: string[]) => {
  isoDates.forEach((isoDate) => calendarDate(isoDate).click());
};
