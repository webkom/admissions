import { defineConfig } from "cypress";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";

const workerRequestDirectory = () => path.resolve(".cypress-worker-requests");

const runSolverWorkerOnce = async ({ jobId }: { jobId: string }) => {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    throw new Error("A valid solver job id is required.");
  }
  const directory = workerRequestDirectory();
  await mkdir(directory, { recursive: true });
  const token = `${Date.now()}-${randomUUID()}`;
  const requestPath = path.join(directory, `${token}.request`);
  const temporaryRequestPath = `${requestPath}.tmp`;
  const donePath = path.join(directory, `${token}.done`);
  await writeFile(temporaryRequestPath, `${jobId}\n`, "utf8");
  await rename(temporaryRequestPath, requestPath);

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const exitCode = (await readFile(donePath, "utf8")).trim();
      await Promise.all([
        rm(requestPath, { force: true }),
        rm(donePath, { force: true }),
      ]);
      if (exitCode !== "0") {
        throw new Error(`The one-shot solver worker exited with ${exitCode}.`);
      }
      return { jobId };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  await rm(requestPath, { force: true });
  throw new Error("Timed out waiting for the one-shot solver worker.");
};

export default defineConfig({
  allowCypressEnv: false,
  projectId: "w2s2pw",
  requestTimeout: 15000,
  e2e: {
    baseUrl: "http://127.0.0.1:5002",
    setupNodeEvents(on) {
      on("task", { runSolverWorkerOnce });
    },
  },
});
