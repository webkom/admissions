const defaultConfig = {
  API_URL: "http://localhost:8000/api"
};
const config = window.__CONFIG__
  ? { ...defaultConfig, ...window.__CONFIG__ }
  : defaultConfig;

export default config;
