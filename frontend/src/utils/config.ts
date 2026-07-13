export type DjangoConfig = {
  SENTRY_DSN?: string;
  RELEASE?: string;
  ENVIRONMENT?: string;
  API_URL: string;
};
const defaultConfig: DjangoConfig = {
  API_URL: "http://127.0.0.1:5000/api",
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
