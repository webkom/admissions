import { defineConfig } from "cypress";

export default defineConfig({
  projectId: "w2s2pw",
  e2e: {
    baseUrl: "http://127.0.0.1:5000",
  },
});
