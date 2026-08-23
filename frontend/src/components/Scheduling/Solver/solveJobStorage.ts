export interface StoredSolveJob {
  jobId: string;
  baseRevision: string | null;
  mode: "result" | "proposal" | "auto-apply" | "preview";
}

interface StorageRead {
  available: boolean;
  value: StoredSolveJob | null;
}

const parseStoredSolveJob = (value: string): StoredSolveJob => {
  try {
    const parsed = JSON.parse(value) as Partial<StoredSolveJob>;
    if (typeof parsed.jobId === "string") {
      return {
        jobId: parsed.jobId,
        baseRevision:
          typeof parsed.baseRevision === "string" ? parsed.baseRevision : null,
        mode:
          parsed.mode === "proposal" ||
          parsed.mode === "auto-apply" ||
          parsed.mode === "preview"
            ? parsed.mode
            : "result",
      };
    }
  } catch {
    return { jobId: value, baseRevision: null, mode: "result" };
  }
  return { jobId: value, baseRevision: null, mode: "result" };
};

const read = (key: string): StorageRead => {
  try {
    const value = window.sessionStorage.getItem(key);
    return {
      available: true,
      value: value ? parseStoredSolveJob(value) : null,
    };
  } catch {
    return { available: false, value: null };
  }
};

const write = (key: string, value: StoredSolveJob): boolean => {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const remove = (key: string) => {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    return;
  }
};

export const createSolveJobStorage = (
  admissionSlug: string,
  actorId?: string | number,
) => {
  const actor = actorId ?? "unknown";
  const jobKey = `admissions.solveJob.${actor}.${admissionSlug}`;
  const proposalKey = `admissions.solveProposal.${actor}.${admissionSlug}`;
  const legacyJobKey = `admissions.solveJob.${admissionSlug}`;

  return {
    removeLegacyJob: () => remove(legacyJobKey),
    readJob: () => read(jobKey),
    writeJob: (value: StoredSolveJob) => write(jobKey, value),
    removeJob: () => remove(jobKey),
    readProposal: () => read(proposalKey),
    writeProposal: (value: StoredSolveJob) => write(proposalKey, value),
    removeProposal: () => remove(proposalKey),
  };
};
