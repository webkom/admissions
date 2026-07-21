import { defineConfig } from "cypress";

export default defineConfig({
  allowCypressEnv: false,
  projectId: "w2s2pw",
  e2e: {
    baseUrl: "http://127.0.0.1:5002",
  },
});
