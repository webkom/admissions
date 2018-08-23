const defaultConfig = {};
const config = window.__DJANGO__
  ? { ...defaultConfig, ...window.__DJANGO__ }
  : defaultConfig;

export default config;
