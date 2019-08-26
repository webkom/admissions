const defaultConfig = {
  API_URL: "http://127.0.0.1:5000/api"
};
const config = window.__CONFIG__
  ? { ...defaultConfig, ...window.__CONFIG__ }
  : defaultConfig;

export default config;
