import { defineConfig } from "cypress";

export default defineConfig({
  allowCypressEnv: false,
  projectId: "w2s2pw",
  requestTimeout: 15000,
  e2e: {
    baseUrl: "http://127.0.0.1:5002",
  },
});
