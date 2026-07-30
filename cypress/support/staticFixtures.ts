const fixtureBaseUrl = "http://localhost:5001/static/cypress/fixtures";

type FixtureQuery =
  | string
  | URLSearchParams
  | Record<string, string | number | boolean>;

const fixtureQueryString = (query: FixtureQuery): string => {
  if (typeof query === "string") return query;
  if (query instanceof URLSearchParams) return query.toString();
  return new URLSearchParams(
    Object.entries(query).map(([key, value]) => [key, String(value)]),
  ).toString();
};

export const visitStaticFixture = (
  fixtureName: string,
  query?: FixtureQuery,
) => {
  const queryString = query ? fixtureQueryString(query) : "";
  cy.visit(
    `${fixtureBaseUrl}/${fixtureName}.html${queryString ? `?${queryString}` : ""}`,
  );
};
