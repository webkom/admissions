export type DjangoConfig = {
  SENTRY_DSN?: string;
  RELEASE?: string;
  ENVIRONMENT?: string;
  API_URL: string;
  SCHEDULER_ENABLED?: boolean;
  CSRF_COOKIE_NAME?: string;
};
const defaultConfig: DjangoConfig = {
  API_URL: "/api",
  SCHEDULER_ENABLED: process.env.NODE_ENV !== "production",
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
