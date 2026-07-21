export type DjangoConfig = {
  SENTRY_DSN?: string;
  RELEASE?: string;
  ENVIRONMENT?: string;
  API_URL: string;
  CSRF_COOKIE_NAME?: string;
};
const defaultConfig: DjangoConfig = {
  API_URL: "/api",
};
const serialized = document.getElementById("frontend-config")?.textContent;
let embedded: DjangoConfig | undefined;
try {
  embedded = serialized ? (JSON.parse(serialized) as DjangoConfig) : undefined;
} catch {
  embedded = undefined;
}
const config = { ...defaultConfig, ...(embedded ?? window.__CONFIG__) };

export default config;
