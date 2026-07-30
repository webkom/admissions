import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { AxiosError } from "axios";

import { DEFAULT_SOLVER_OPTIONS } from "../../frontend/src/components/Scheduling/Solver/solverHelpers";
import type {
  SolveJob,
  SolveResponse,
} from "../../frontend/src/components/Scheduling/Solver/solverHelpers";
import SolverView from "../../frontend/src/components/Scheduling/Solver/SolverView";
import { useScheduleDraftPersistence } from "../../frontend/src/components/Scheduling/Solver/useScheduleDraftPersistence";
import { createSolveJobLifecycle } from "../../frontend/src/components/Scheduling/Solver/solveJobLifecycle";
import { useSolveJob } from "../../frontend/src/components/Scheduling/Solver/useSolveJob";
import { useSolverSession } from "../../frontend/src/components/Scheduling/Solver/useSolverSession";
import { useSaveSchedule } from "../../frontend/src/query/hooks";
import { defaultQueryFn } from "../../frontend/src/query/queries";
import {
  blockSensitiveAdmissionCacheWrites,
  clearSensitiveAdmissionDataForScopeChange,
  isSensitiveAuthorityChangedError,
  restoreSensitiveAccessAfterVerifiedAdmission,
} from "../../frontend/src/query/sensitiveAccess";
import { buildInterviewOutreachTemplateStorageKey } from "../../frontend/src/query/sensitiveBrowserStorage";
import type { Admission, SavedSchedule } from "../../frontend/src/types";
import djangoData from "../../frontend/src/utils/djangoData";
import { collectUnhandledRejections } from "../support/unhandledRejections";

const admissionSlug = "race-admission";
const scheduleKey = [`/admin/admission/${admissionSlug}/schedule/`];

const solveResult = (candidate: string): SolveResponse => ({
  status: "SUCCESS",
  schedule: [
    {
      candidate_id: candidate.toLowerCase(),
      candidate,
      time: 840,
      panel: [],
    },
  ],
});

const solveJob = (
  jobId: string,
  status: SolveJob["status"],
  result: SolveResponse | null,
): SolveJob => ({
  job_id: jobId,
  request_fingerprint: `fingerprint-${jobId}`,
  status,
  result,
  error: status === "ERROR" ? "Deterministic solver failure" : "",
  created_at: "2026-07-24T08:00:00Z",
  started_at: status === "PENDING" ? null : "2026-07-24T08:00:01Z",
  finished_at:
    status === "PENDING" || status === "RUNNING"
      ? null
      : "2026-07-24T08:00:02Z",
  applied_at: null,
  discarded_at: status === "CANCELLED" ? "2026-07-24T08:00:03Z" : null,
  proposal_expires_at: "2099-07-25T08:00:00Z",
  baseline_updated_at: "revision-1",
  auto_apply_if_empty: false,
  preview_only: false,
});

const savedSchedule = (candidate: string): SavedSchedule => ({
  id: 1,
  schedule: solveResult(candidate).schedule,
  start_date: "2026-07-27",
  end_date: "2026-07-27",
  session_duration: 60,
  enabled_windows: [
    {
      date: "2026-07-27",
      start_minute: 840,
      end_minute: 900,
    },
  ],
  enabled_slots: ["2026-07-27|840"],
  day_start_minute: 840,
  day_end_minute: 900,
  chunk_size: 1,
  chunk_break_minutes: 0,
  block_mode: "standard",
  resolved_blocks: [],
  manual_blocks: [],
  layout_version: 2,
  slot_overrides: [],
  availability_generation: 1,
  layout_capabilities: {
    version: 2,
    slot_overrides: true,
    availability_projection: true,
    opened_pause_semantics: "separate_block",
  },
  panel_size: 1,
  solver_options: DEFAULT_SOLVER_OPTIONS,
  deviation_review: null,
  is_distributed: false,
  conflict_review_open: false,
  name_visibility: "hidden",
  updated_at: "revision-2",
});

const SolveHarness = () => {
  const solve = useSolveJob(admissionSlug);
  const run = (
    purpose: string,
    options: {
      applyResult?: boolean;
      retainAsProposal?: boolean;
      previewOnly?: boolean;
    } = {},
  ) => void solve.solve({ purpose }, "revision-1", options);

  return (
    <div>
      <output data-cy="solve-result">
        {solve.result?.schedule[0]?.candidate ?? "none"}
      </output>
      <output data-cy="solve-error">{solve.error || "none"}</output>
      <output data-cy="solve-job-status">{solve.jobStatus ?? "none"}</output>
      <output data-cy="solve-proposal">
        {solve.pendingProposal?.job.job_id ?? "none"}
      </output>
      <button type="button" onClick={() => run("seed")}>
        Seed result
      </button>
      <button type="button" onClick={() => run("solve-a")}>
        Start solve A
      </button>
      <button type="button" onClick={() => run("solve-b")}>
        Start solve B
      </button>
      <button
        type="button"
        onClick={() =>
          run("proposal", {
            applyResult: false,
            retainAsProposal: true,
          })
        }
      >
        Create proposal
      </button>
      <button type="button" onClick={() => void solve.applyProposal()}>
        Apply proposal
      </button>
      <button type="button" onClick={() => void solve.cancel()}>
        Cancel solve
      </button>
      <button type="button" onClick={solve.reset}>
        Reset solve
      </button>
      <button type="button" onClick={() => run("optional-error")}>
        Optional regeneration error
      </button>
      <button
        type="button"
        onClick={() => run("repair-error", { applyResult: false })}
      >
        Repair error
      </button>
    </div>
  );
};

const RoleScopeHarness = ({ queryClient }: { queryClient: QueryClient }) => {
  const [hasAdminScope, setHasAdminScope] = React.useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          clearSensitiveAdmissionDataForScopeChange(queryClient, admissionSlug);
          setHasAdminScope(false);
        }}
      >
        Downgrade role
      </button>
      {hasAdminScope ? <SolveHarness /> : <p>Recruiter scope</p>}
    </div>
  );
};

const UnmountDuringSolveHarness = () => {
  const [mounted, setMounted] = React.useState(true);
  return (
    <div>
      <button type="button" onClick={() => setMounted(false)}>
        Leave scheduler
      </button>
      {mounted ? <SolveHarness /> : <p>Different route</p>}
    </div>
  );
};

const WorkerAutoApplyHarness = () => {
  const session = useSolverSession({
    admissionSlug,
    candidates: [{ id: "auto-applied", name: "Auto applied" }],
    interviewers: [
      {
        id: "interviewer-1",
        name: "Interviewer",
        availability: [840],
        biased: [],
        has_submitted: true,
        participation: "participating",
        experience_level: "experienced",
      },
    ],
    dates: ["2026-07-27"],
    sessionDuration: 60,
    enabledSlots: new Set(["2026-07-27|840"]),
    canonicalBlocks: [[840]],
    syntheticInput: false,
    candidateScopeResolved: true,
  });

  return (
    <div>
      <output data-cy="worker-applied-schedule">
        {session.savedSchedule?.schedule[0]?.candidate ?? "empty"}
      </output>
      <output data-cy="worker-applied-result">
        {session.scopedResult?.schedule[0]?.candidate ?? "none"}
      </output>
      <output data-cy="worker-applied-proposal">
        {session.pendingProposal?.job.job_id ?? "none"}
      </output>
      <button
        type="button"
        onClick={() => void session.solvePlan([])}
        disabled={!session.readiness.ready}
      >
        Generate first draft
      </button>
    </div>
  );
};

const SaveScheduleEpochHarness = ({
  queryClient,
}: {
  queryClient: QueryClient;
}) => {
  const saveSchedule = useSaveSchedule(admissionSlug);
  const [outcome, setOutcome] = React.useState("idle");
  const save = async (candidate: string) => {
    setOutcome("saving");
    try {
      await saveSchedule.mutateAsync({
        schedule: savedSchedule(candidate).schedule,
        expected_updated_at: "revision-1",
      });
      setOutcome(`saved:${candidate}`);
    } catch (error) {
      setOutcome(
        isSensitiveAuthorityChangedError(error) ? "stale" : "request-error",
      );
    }
  };

  const changeScopeAndRecover = () => {
    clearSensitiveAdmissionDataForScopeChange(queryClient, admissionSlug);
    blockSensitiveAdmissionCacheWrites(
      admissionSlug,
      new AxiosError("Access removed"),
    );
    restoreSensitiveAccessAfterVerifiedAdmission(queryClient, admissionSlug, {
      slug: admissionSlug,
      userdata: {
        actor_id: "recruiter-actor",
        has_application: false,
        is_privileged: true,
        is_admin: false,
        is_recruiter: true,
        committee_role: "recruiting",
        committee_groups: ["Webkom"],
        represented_groups: ["Webkom"],
      },
    } as Admission);
  };

  return (
    <div>
      <output data-cy="schedule-save-outcome">{outcome}</output>
      <button type="button" onClick={() => void save("Private old response")}>
        Start old save
      </button>
      <button type="button" onClick={changeScopeAndRecover}>
        Change scope and recover
      </button>
      <button type="button" onClick={() => void save("Fresh response")}>
        Start fresh save
      </button>
    </div>
  );
};

const DraftConflictHarness = () => {
  const [conflicts, setConflicts] = React.useState(0);
  const persistence = useScheduleDraftPersistence({
    result: solveResult("Local draft"),
    savedSchedule: {
      ...savedSchedule("Server baseline"),
      schedule: [],
      updated_at: "revision-1",
    },
    hasLocalDraft: true,
    loading: false,
    solveTick: 0,
    draftBaseRevision: "revision-1",
    remoteRevisionChanged: false,
    config: {
      admissionSlug,
      startDate: "2026-07-27",
      endDate: "2026-07-27",
      sessionDuration: 60,
      enabledWindows: [
        {
          date: "2026-07-27",
          start_minute: 840,
          end_minute: 900,
        },
      ],
      enabledSlots: new Set(["2026-07-27|840"]),
      dayStartMinute: 840,
      dayEndMinute: 900,
      chunkSize: 1,
      chunkBreakMinutes: 0,
      blockMode: "standard",
      manualBlocks: [],
      slotOverrides: [],
      panelSize: 1,
      solverOptions: DEFAULT_SOLVER_OPTIONS,
    },
    onConflict: () => setConflicts((count) => count + 1),
    onRevisionSaved: () => undefined,
    onSaved: () => undefined,
  });

  return (
    <div>
      <output data-cy="draft-save-state">{persistence.state}</output>
      <output data-cy="draft-conflicts">{conflicts}</output>
      <output data-cy="draft-authority">
        {persistence.hasConflict ? "server-newer" : "local"}
      </output>
      <output data-cy="draft-value">Local draft</output>
    </div>
  );
};

const ProposalComparisonHarness = () => (
  <SolverView
    candidates={[{ id: "candidate-1", name: "Current candidate" }]}
    interviewers={[
      {
        id: "interviewer-1",
        name: "Interviewer",
        availability: [840],
        biased: [],
        has_submitted: true,
        participation: "participating",
        experience_level: "experienced",
      },
    ]}
    dates={["2026-07-27"]}
    sessionDuration={60}
    admissionTitle="Proposal race"
    admissionSlug={admissionSlug}
    startDate="2026-07-27"
    endDate="2026-07-27"
    enabledWindows={[
      {
        date: "2026-07-27",
        start_minute: 840,
        end_minute: 900,
      },
    ]}
    enabledSlots={new Set(["2026-07-27|840"])}
    dayStartMinute={840}
    dayEndMinute={900}
    chunkSize={1}
    chunkBreakMinutes={0}
    blockMode="standard"
    manualBlocks={[]}
    slotOverrides={[]}
    candidateScopeResolved
    availabilityReady
    editRequestKey={0}
    currentReviewRequired={false}
    currentReviewComplete
    completeReviewerCount={0}
    requiredReviewerCount={0}
    pendingReviewerCount={0}
    missingReviewerNames={[]}
    publicationReady
    onDraftPersistenceChange={() => undefined}
    onOpenAvailability={() => undefined}
    onOpenFramework={() => undefined}
    onOpenConflictReview={() => undefined}
    onOpenPlan={() => undefined}
  />
);

const mountHarness = (
  element: React.ReactElement,
  queryClient: QueryClient,
  waitForLatestSolve = true,
  beforeRender?: (window: Window) => void,
) => {
  cy.intercept("GET", "**/api/solve/latest/**", {
    statusCode: 204,
    body: "",
  }).as("latestSolve");
  cy.visit("/api-auth/login/", {
    onBeforeLoad(window) {
      window.sessionStorage.clear();
    },
  });
  cy.document().then((document) => {
    const window = document.defaultView;
    if (!window) throw new Error("Race harness window was not created");
    beforeRender?.(window);
    document.body.innerHTML = '<div id="race-root"></div>';
    const root = document.getElementById("race-root");
    if (!root) throw new Error("Race harness root was not created");
    createRoot(root).render(
      <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
    );
  });
  if (waitForLatestSolve) cy.wait("@latestSolve");
};

const queryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const queryClientWithDefaultQuery = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, queryFn: defaultQueryFn },
      mutations: { retry: false },
    },
  });

const verifiedAdmission = {
  slug: admissionSlug,
  userdata: {
    actor_id: "admin-actor",
    has_application: false,
    is_privileged: true,
    is_admin: true,
    is_recruiter: false,
    committee_role: "leader",
    committee_groups: ["Webkom"],
    represented_groups: ["Webkom"],
  },
} as Admission;

const seedSensitiveSchedule = (
  client: QueryClient,
  schedule: SavedSchedule,
) => {
  client
    .getQueryCache()
    .build(client, {
      queryKey: scheduleKey,
      meta: { sensitive: true, admissionSlug },
    })
    .setData(schedule);
};

describe("solver asynchronous and revision races", () => {
  beforeEach(() => {
    restoreSensitiveAccessAfterVerifiedAdmission(
      queryClient(),
      admissionSlug,
      verifiedAdmission,
    );
    window.localStorage.clear();
  });

  it("rehydrates a first draft that the worker already applied", () => {
    const client = queryClientWithDefaultQuery();
    const initialSchedule = {
      ...savedSchedule("Unused"),
      schedule: [],
      updated_at: "revision-1",
    };
    const promotedSchedule = {
      ...savedSchedule("Auto applied"),
      schedule: [
        {
          candidate_id: "auto-applied",
          candidate: "Auto applied",
          time: 840,
          panel: [],
        },
      ],
      updated_at: "revision-2",
    };
    const promotedResult: SolveResponse = {
      status: "SUCCESS",
      schedule: promotedSchedule.schedule,
    };
    let scheduleReads = 0;
    let applyRequests = 0;

    cy.intercept(
      "GET",
      "**/api/admin/admission/race-admission/schedule/",
      (request) => {
        scheduleReads += 1;
        request.reply({
          statusCode: 200,
          body: scheduleReads === 1 ? initialSchedule : promotedSchedule,
        });
      },
    ).as("workerAppliedSchedule");
    cy.intercept("POST", "**/api/solve/", {
      statusCode: 202,
      body: {
        ...solveJob("worker-applied-job", "DONE", promotedResult),
        applied_at: "2026-07-24T08:00:03Z",
        auto_apply_if_empty: true,
      },
    }).as("workerAppliedSolve");
    cy.intercept(
      "POST",
      "**/api/solve/worker-applied-job/apply/",
      (request) => {
        applyRequests += 1;
        request.reply({ statusCode: 500 });
      },
    );

    mountHarness(<WorkerAutoApplyHarness />, client);
    cy.wait("@workerAppliedSchedule");
    cy.contains("button", "Generate first draft")
      .should("not.be.disabled")
      .click();
    cy.wait("@workerAppliedSolve");

    cy.get("[data-cy=worker-applied-schedule]").should(
      "have.text",
      "Auto applied",
    );
    cy.get("[data-cy=worker-applied-result]").should(
      "have.text",
      "Auto applied",
    );
    cy.get("[data-cy=worker-applied-proposal]").should("have.text", "none");
    cy.then(() => {
      expect(scheduleReads).to.be.greaterThan(1);
      expect(applyRequests).to.equal(0);
    });
  });

  it("ignores a late cancel response after a newer solve completes", () => {
    let releaseCancel: (() => void) | null = null;
    cy.intercept("POST", "**/api/solve/", (request) => {
      const purpose = request.body.purpose as string;
      if (purpose === "seed") {
        request.reply({
          statusCode: 202,
          body: solveJob("seed-job", "DONE", solveResult("Seed")),
        });
      } else if (purpose === "solve-a") {
        request.reply({
          statusCode: 202,
          body: solveJob("job-a", "RUNNING", null),
        });
      } else {
        request.reply({
          statusCode: 202,
          body: solveJob("job-b", "DONE", solveResult("Solve B")),
        });
      }
    });
    cy.intercept("DELETE", "**/api/solve/job-a/", (request) => {
      return new Promise<void>((resolve) => {
        releaseCancel = () => {
          request.reply({
            statusCode: 200,
            body: solveJob("job-a", "CANCELLED", null),
          });
          resolve();
        };
      });
    }).as("cancelA");
    cy.intercept("GET", "**/api/solve/job-a/", {
      statusCode: 200,
      body: solveJob("job-a", "RUNNING", null),
    });

    mountHarness(<SolveHarness />, queryClient());
    cy.contains("button", "Seed result").click();
    cy.get("[data-cy=solve-result]").should("have.text", "Seed");
    cy.contains("button", "Start solve A").click();
    cy.get("[data-cy=solve-job-status]").should("have.text", "RUNNING");
    cy.contains("button", "Cancel solve").click();
    cy.wrap(null).should(() => expect(releaseCancel).to.be.a("function"));
    cy.contains("button", "Start solve B").click();
    cy.get("[data-cy=solve-result]").should("have.text", "Solve B");
    cy.then(() => releaseCancel?.());
    cy.wait("@cancelA");
    cy.get("[data-cy=solve-result]").should("have.text", "Solve B");
  });

  it("keeps a failed background reset cancellation from escaping the UI", () => {
    cy.intercept("POST", "**/api/solve/", {
      statusCode: 202,
      body: solveJob("reset-job", "RUNNING", null),
    }).as("resetSolve");
    cy.intercept("DELETE", "**/api/solve/reset-job/", {
      statusCode: 500,
      body: { detail: "Temporary cancellation failure" },
    }).as("resetCancel");
    cy.intercept("GET", "**/api/solve/reset-job/", {
      statusCode: 200,
      body: solveJob("reset-job", "RUNNING", null),
    });

    mountHarness(<SolveHarness />, queryClient());
    collectUnhandledRejections().as("unhandledRejections");
    cy.contains("button", "Start solve A").click();
    cy.wait("@resetSolve");
    cy.contains("button", "Reset solve").click();
    cy.wait("@resetCancel");
    cy.window().then(
      (window) =>
        new Cypress.Promise<void>((resolve) => window.setTimeout(resolve, 0)),
    );
    cy.get<unknown[]>("@unhandledRejections").should("have.length", 0);
  });

  it("keeps a failed persisted-proposal restore recoverable", () => {
    const unhandledRejections: unknown[] = [];
    const actor = djangoData.user.id ?? "unknown";
    const proposalKey = `admissions.solveProposal.${actor}.${admissionSlug}`;
    cy.intercept("GET", "**/api/solve/restored-proposal/", {
      statusCode: 500,
      body: { detail: "Temporary restore failure" },
    }).as("failedProposalRestore");

    mountHarness(<SolveHarness />, queryClient(), false, (window) => {
      window.addEventListener("unhandledrejection", (event) => {
        event.preventDefault();
        unhandledRejections.push(event.reason);
      });
      window.sessionStorage.setItem(
        proposalKey,
        JSON.stringify({
          jobId: "restored-proposal",
          baseRevision: "revision-1",
          mode: "proposal",
        }),
      );
    });
    cy.wait("@failedProposalRestore");
    cy.window().then(
      (window) =>
        new Cypress.Promise<void>((resolve) => window.setTimeout(resolve, 0)),
    );
    cy.then(() => expect(unhandledRejections).to.have.length(0));
    cy.get("[data-cy=solve-error]").should(
      "contain.text",
      "Kunne ikke gjenopprette forslaget",
    );
    cy.window()
      .its("sessionStorage")
      .invoke("getItem", proposalKey)
      .should("not.equal", null);
  });

  it("ignores a superseded solve response that arrives after the replacement", () => {
    let releaseSolveA: (() => void) | null = null;
    cy.intercept("POST", "**/api/solve/", (request) => {
      if (request.body.purpose === "solve-a") {
        return new Promise<void>((resolve) => {
          releaseSolveA = () => {
            request.reply({
              statusCode: 202,
              body: solveJob("job-a", "DONE", solveResult("Solve A")),
            });
            resolve();
          };
        });
      }
      request.reply({
        statusCode: 202,
        body: solveJob("job-b", "DONE", solveResult("Solve B")),
      });
    }).as("solveRequest");

    mountHarness(<SolveHarness />, queryClient());
    cy.contains("button", "Start solve A").click();
    cy.wrap(null).should(() => expect(releaseSolveA).to.be.a("function"));
    cy.contains("button", "Start solve B").click();
    cy.get("[data-cy=solve-result]").should("have.text", "Solve B");
    cy.then(() => releaseSolveA?.());
    cy.wait("@solveRequest");
    cy.get("[data-cy=solve-result]").should("have.text", "Solve B");
  });

  it("ignores a duplicate same-job response from the superseded request", () => {
    let releaseFirstResponse: (() => void) | null = null;
    cy.intercept("POST", "**/api/solve/", (request) => {
      if (request.body.purpose === "solve-a") {
        return new Promise<void>((resolve) => {
          releaseFirstResponse = () => {
            request.reply({
              statusCode: 202,
              body: solveJob(
                "shared-job",
                "DONE",
                solveResult("Stale duplicate"),
              ),
            });
            resolve();
          };
        });
      }
      request.reply({
        statusCode: 202,
        body: solveJob("shared-job", "DONE", solveResult("Current duplicate")),
      });
    }).as("duplicateSolve");

    mountHarness(<SolveHarness />, queryClient());
    cy.contains("button", "Start solve A").click();
    cy.wrap(null).should(() =>
      expect(releaseFirstResponse).to.be.a("function"),
    );
    cy.contains("button", "Start solve B").click();
    cy.get("[data-cy=solve-result]").should("have.text", "Current duplicate");
    cy.then(() => releaseFirstResponse?.());
    cy.wait("@duplicateSolve");
    cy.get("[data-cy=solve-result]").should("have.text", "Current duplicate");
  });

  it("makes a running poll inert when the scheduler route unmounts", () => {
    let pollRequests = 0;
    cy.clock();
    cy.intercept("POST", "**/api/solve/", {
      statusCode: 202,
      body: solveJob("route-job", "RUNNING", null),
    });
    cy.intercept("GET", "**/api/solve/route-job/", (request) => {
      pollRequests += 1;
      request.reply({
        statusCode: 200,
        body: solveJob("route-job", "DONE", solveResult("Too late")),
      });
    });

    mountHarness(<UnmountDuringSolveHarness />, queryClient());
    cy.contains("button", "Start solve A").click();
    cy.get("[data-cy=solve-job-status]").should("have.text", "RUNNING");
    cy.contains("button", "Leave scheduler").click();
    cy.contains("Different route").should("be.visible");
    cy.tick(1501);
    cy.then(() => expect(pollRequests).to.equal(0));
    cy.contains("Too late").should("not.exist");
  });

  it("retries transient solve polling failures with backoff", () => {
    let pollCount = 0;
    cy.clock();
    cy.intercept("POST", "**/api/solve/", {
      statusCode: 202,
      body: solveJob("transient-poll-job", "RUNNING", null),
    });
    cy.intercept("GET", "**/api/solve/transient-poll-job/", (request) => {
      pollCount += 1;
      if (pollCount === 1) {
        request.reply({ statusCode: 503, body: { detail: "Try again" } });
        return;
      }
      request.reply({
        statusCode: 200,
        body: solveJob(
          "transient-poll-job",
          "DONE",
          solveResult("Recovered poll"),
        ),
      });
    }).as("transientPoll");

    mountHarness(<SolveHarness />, queryClient());
    cy.contains("button", "Start solve A").click();
    cy.tick(1500);
    cy.wait("@transientPoll");
    cy.get("[data-cy=solve-job-status]").should("have.text", "RUNNING");
    cy.tick(1500);
    cy.wait("@transientPoll");
    cy.get("[data-cy=solve-result]").should("have.text", "Recovered poll");
  });

  it("keeps comparison explicit and blocks apply when its baseline revision changes", () => {
    cy.viewport(1280, 900);
    const client = queryClientWithDefaultQuery();
    const currentSchedule = {
      ...savedSchedule("Current candidate"),
      schedule: [
        {
          candidate_id: "candidate-1",
          candidate: "Current candidate",
          time: 840,
          panel: [
            {
              id: "interviewer-1",
              name: "Interviewer",
              is_overtime: false,
            },
          ],
        },
      ],
      updated_at: "revision-1",
    };
    const proposedResult: SolveResponse = {
      status: "SUCCESS",
      schedule: [
        {
          candidate_id: "candidate-1",
          candidate: "Current candidate",
          time: 840,
          panel: [
            {
              id: "interviewer-1",
              name: "Interviewer",
              is_overtime: false,
            },
          ],
        },
      ],
    };
    cy.intercept("GET", "**/api/admin/admission/race-admission/schedule/", {
      statusCode: 200,
      body: currentSchedule,
    }).as("proposalSchedule");
    cy.intercept("GET", "**/api/solve/latest/**", {
      statusCode: 200,
      body: solveJob("comparison-job", "DONE", proposedResult),
    }).as("latestProposal");

    cy.visit("/", {
      onBeforeLoad(window) {
        window.sessionStorage.clear();
      },
    });
    cy.document().then((document) => {
      document.body.innerHTML = '<div id="race-root"></div>';
      const root = document.getElementById("race-root");
      if (!root) throw new Error("Race harness root was not created");
      createRoot(root).render(
        <QueryClientProvider client={client}>
          <ProposalComparisonHarness />
        </QueryClientProvider>,
      );
    });
    cy.wait(["@proposalSchedule", "@latestProposal"]);
    cy.get("[data-cy=candidate-proposal]").should("be.visible");
    cy.contains("button", "Sammenlign med gjeldende utkast").click();
    cy.get("#proposal-comparison-heading").should("be.focused");

    cy.then(() => {
      client.setQueryData(scheduleKey, {
        ...currentSchedule,
        updated_at: "revision-2",
      });
    });

    cy.get("[data-cy=proposal-comparison]").should("be.visible");
    cy.get("#proposal-comparison-heading").should("be.focused");
    cy.contains(
      "Utkastet er endret etter beregningen. Lag et nytt forslag før du fortsetter.",
    ).should("be.visible");
    cy.get("[data-cy=schedule-stage-primary-action]").should(
      "contain.text",
      "Forkast og lag nytt",
    );
    cy.screenshot("scheduler-workflow/07-proposal-comparison-stale", {
      capture: "viewport",
    });
    cy.get("#proposal-comparison-heading").type("{esc}");
    cy.get("[data-cy=proposal-comparison]").should("not.exist");
    cy.contains("button", "Sammenlign med gjeldende utkast").should(
      "be.focused",
    );
  });

  it("persists apply-time invalidation across reload without a revision change", () => {
    const client = queryClientWithDefaultQuery();
    const actor = djangoData.user.id ?? "unknown";
    const proposalKey = `admissions.solveProposal.${actor}.${admissionSlug}`;
    const revisionOne = {
      ...savedSchedule("Current candidate"),
      schedule: [
        {
          candidate_id: "candidate-1",
          candidate: "Current candidate",
          time: 840,
          panel: [
            {
              id: "interviewer-1",
              name: "Interviewer",
              is_overtime: false,
            },
          ],
        },
      ],
      updated_at: "revision-1",
    };
    const proposedResult: SolveResponse = {
      status: "SUCCESS",
      schedule: revisionOne.schedule,
    };
    let scheduleReads = 0;
    let applyRequests = 0;
    let proposalInvalidated = false;
    let mountedRoot: ReturnType<typeof createRoot> | null = null;
    const persistedProposal = () => ({
      ...solveJob("apply-conflict-job", "DONE", proposedResult),
      discarded_at: proposalInvalidated ? "2026-07-24T08:00:04Z" : null,
    });

    cy.intercept(
      "GET",
      "**/api/admin/admission/race-admission/schedule/",
      (request) => {
        scheduleReads += 1;
        request.reply({ statusCode: 200, body: revisionOne });
      },
    ).as("applyConflictSchedule");
    cy.intercept("GET", "**/api/solve/latest/**", (request) => {
      request.reply({ statusCode: 200, body: persistedProposal() });
    }).as("applyConflictProposal");
    cy.intercept("GET", "**/api/solve/apply-conflict-job/", (request) => {
      request.reply({ statusCode: 200, body: persistedProposal() });
    }).as("restoredRejectedProposal");
    cy.intercept(
      "POST",
      "**/api/solve/apply-conflict-job/apply/",
      (request) => {
        applyRequests += 1;
        proposalInvalidated = true;
        request.reply({
          statusCode: 409,
          body: {
            detail:
              "Planutkastet er endret siden forslaget ble beregnet. Beregn et nytt forslag.",
          },
        });
      },
    ).as("applyConflict");

    cy.visit("/", {
      onBeforeLoad(window) {
        window.sessionStorage.clear();
      },
    });
    cy.document().then((document) => {
      document.body.innerHTML = '<div id="race-root"></div>';
      const root = document.getElementById("race-root");
      if (!root) throw new Error("Race harness root was not created");
      mountedRoot = createRoot(root);
      mountedRoot.render(
        <QueryClientProvider client={client}>
          <ProposalComparisonHarness />
        </QueryClientProvider>,
      );
    });
    cy.wait(["@applyConflictSchedule", "@applyConflictProposal"]);
    cy.contains("button", "Bruk forslaget").click();
    cy.wait("@applyConflict");
    cy.wait("@applyConflictSchedule");

    cy.get("[data-cy=candidate-proposal]").should("be.visible");
    cy.contains(
      "Utkastet er endret etter beregningen. Lag et nytt forslag før du fortsetter.",
    ).should("be.visible");
    cy.get("[data-cy=schedule-stage-primary-action]").should(
      "contain.text",
      "Forkast og lag nytt",
    );
    cy.then(() => {
      expect(scheduleReads).to.be.greaterThan(1);
      expect(applyRequests).to.equal(1);
    });
    cy.window()
      .its("sessionStorage")
      .invoke("getItem", proposalKey)
      .should("not.equal", null);

    cy.then(() => mountedRoot?.unmount());
    cy.window()
      .its("sessionStorage")
      .invoke("getItem", proposalKey)
      .should("not.equal", null);
    const reloadedClient = queryClientWithDefaultQuery();
    cy.document().then((document) => {
      document.body.innerHTML = '<div id="race-root"></div>';
      const root = document.getElementById("race-root");
      if (!root) throw new Error("Race harness root was not created");
      mountedRoot = createRoot(root);
      mountedRoot.render(
        <QueryClientProvider client={reloadedClient}>
          <ProposalComparisonHarness />
        </QueryClientProvider>,
      );
    });
    cy.wait(["@applyConflictSchedule", "@restoredRejectedProposal"]);
    cy.get("[data-cy=candidate-proposal]").should("not.exist");
    cy.contains("button", "Bruk forslaget").should("not.exist");
    cy.then(() => expect(applyRequests).to.equal(1));
  });

  it("restores focus to the current draft after closing regeneration", () => {
    const client = queryClientWithDefaultQuery();
    const currentSchedule = {
      ...savedSchedule("Current candidate"),
      schedule: [
        {
          candidate_id: "candidate-1",
          candidate: "Current candidate",
          time: 840,
          panel: [
            {
              id: "interviewer-1",
              name: "Interviewer",
              is_overtime: false,
            },
          ],
        },
      ],
      updated_at: "revision-1",
    };
    cy.intercept("GET", "**/api/admin/admission/race-admission/schedule/", {
      statusCode: 200,
      body: currentSchedule,
    }).as("focusRestoreSchedule");

    mountHarness(<ProposalComparisonHarness />, client);
    cy.wait("@focusRestoreSchedule");
    cy.get("[data-cy=proposal-review]").should("be.visible");
    cy.contains("summary", "Endre planen").click();
    cy.get("[data-cy=proposal-rerun]").click();
    cy.get("[data-cy=regeneration-settings]").should("be.visible");
    cy.contains("button", "Tilbake til planutkast").focus().click();
    cy.get("[data-cy=regeneration-settings]").should("not.exist");
    cy.get("[data-cy=proposal-review] h2").should("be.focused");
  });

  it("cannot repopulate privileged schedule cache after a role-scope remount", () => {
    const client = queryClient();
    let releaseApply: (() => void) | null = null;
    cy.intercept("POST", "**/api/solve/", {
      statusCode: 202,
      body: solveJob("proposal-job", "DONE", solveResult("Proposal")),
    });
    cy.intercept("POST", "**/api/solve/proposal-job/apply/", (request) => {
      return new Promise<void>((resolve) => {
        releaseApply = () => {
          request.reply({
            statusCode: 200,
            body: savedSchedule("Private candidate"),
          });
          resolve();
        };
      });
    }).as("applyProposal");

    mountHarness(<RoleScopeHarness queryClient={client} />, client);
    cy.contains("button", "Create proposal").click();
    cy.get("[data-cy=solve-proposal]").should("have.text", "proposal-job");
    cy.contains("button", "Apply proposal").click();
    cy.wrap(null).should(() => expect(releaseApply).to.be.a("function"));
    cy.contains("button", "Downgrade role").click();
    cy.contains("Recruiter scope").should("be.visible");
    cy.then(() => releaseApply?.());
    cy.wait("@applyProposal");
    cy.then(() => {
      expect(client.getQueryData(scheduleKey)).to.equal(undefined);
    });
    cy.contains("Private candidate").should("not.exist");
  });

  it("rejects a delayed schedule mutation after scope recovery but accepts a fresh one", () => {
    const client = queryClient();
    let releaseOldSave: (() => void) | null = null;
    cy.intercept(
      "POST",
      "**/api/admin/admission/race-admission/schedule/",
      (request) => {
        const candidate = request.body.schedule?.[0]?.candidate as string;
        if (candidate === "Private old response") {
          return new Promise<void>((resolve) => {
            releaseOldSave = () => {
              request.reply({
                statusCode: 200,
                body: savedSchedule("Private old response"),
              });
              resolve();
            };
          });
        }
        request.reply({
          statusCode: 200,
          body: savedSchedule("Fresh response"),
        });
      },
    ).as("saveSchedule");

    mountHarness(
      <SaveScheduleEpochHarness queryClient={client} />,
      client,
      false,
    );
    cy.contains("button", "Start old save").click();
    cy.wrap(null).should(() => expect(releaseOldSave).to.be.a("function"));
    cy.contains("button", "Change scope and recover").click();
    cy.then(() => releaseOldSave?.());
    cy.wait("@saveSchedule");
    cy.get("[data-cy=schedule-save-outcome]").should("have.text", "stale");
    cy.then(() => {
      expect(client.getQueryData(scheduleKey)).to.equal(undefined);
    });

    cy.contains("button", "Start fresh save").click();
    cy.wait("@saveSchedule");
    cy.get("[data-cy=schedule-save-outcome]").should(
      "have.text",
      "saved:Fresh response",
    );
    cy.then(() => {
      const current = client.getQueryData<SavedSchedule>(scheduleKey);
      expect(current?.schedule[0]?.candidate).to.equal("Fresh response");
    });
  });

  it("purges admission scope when schedule saving reports not found", () => {
    const client = queryClient();
    const templateKey = buildInterviewOutreachTemplateStorageKey(
      admissionSlug,
      "admin-actor",
      "webkom",
    );
    window.localStorage.setItem(templateKey, "Private outreach text");
    seedSensitiveSchedule(client, savedSchedule("Private candidate"));
    cy.intercept("POST", "**/api/admin/admission/race-admission/schedule/", {
      statusCode: 404,
      body: { detail: "Not found" },
    }).as("missingSchedule");

    mountHarness(
      <SaveScheduleEpochHarness queryClient={client} />,
      client,
      false,
    );
    cy.contains("button", "Start fresh save").click();
    cy.wait("@missingSchedule");
    cy.get("[data-cy=schedule-save-outcome]").should(
      "have.text",
      "request-error",
    );
    cy.then(() => {
      expect(client.getQueryData(scheduleKey)).to.equal(undefined);
      expect(window.localStorage.getItem(templateKey)).to.equal(null);
    });
  });

  it("purges admission scope when latest solve lookup reports not found", () => {
    const client = queryClient();
    const templateKey = buildInterviewOutreachTemplateStorageKey(
      admissionSlug,
      "admin-actor",
      "webkom",
    );
    window.localStorage.setItem(templateKey, "Private outreach text");
    seedSensitiveSchedule(client, savedSchedule("Private candidate"));
    cy.intercept("GET", "**/api/solve/latest/**", {
      statusCode: 404,
      body: { detail: "Not found" },
    }).as("missingLatest");

    cy.then(() => createSolveJobLifecycle(admissionSlug, client).latest()).then(
      (outcome) => {
        expect(outcome.kind).to.equal("access-failure");
        expect(client.getQueryData(scheduleKey)).to.equal(undefined);
        expect(window.localStorage.getItem(templateKey)).to.equal(null);
      },
    );
    cy.wait("@missingLatest");
  });

  it("keeps the valid draft through optional regeneration and repair failures", () => {
    cy.intercept("POST", "**/api/solve/", (request) => {
      const purpose = request.body.purpose as string;
      if (purpose === "seed") {
        request.reply({
          statusCode: 202,
          body: solveJob("seed-job", "DONE", solveResult("Current draft")),
        });
        return;
      }
      request.reply({
        statusCode: 202,
        body: solveJob(`${purpose}-job`, "ERROR", null),
      });
    });

    mountHarness(<SolveHarness />, queryClient());
    cy.contains("button", "Seed result").click();
    cy.get("[data-cy=solve-result]").should("have.text", "Current draft");
    cy.contains("button", "Optional regeneration error").click();
    cy.get("[data-cy=solve-result]").should("have.text", "Current draft");
    cy.get("[data-cy=solve-error]").should(
      "contain.text",
      "Deterministic solver failure",
    );
    cy.contains("button", "Repair error").click();
    cy.get("[data-cy=solve-result]").should("have.text", "Current draft");
    cy.get("[data-cy=solve-error]").should(
      "contain.text",
      "Deterministic solver failure",
    );
  });

  it("keeps a local edit unsaved and authoritative recovery explicit after 409", () => {
    cy.clock();
    cy.intercept("POST", "**/api/admin/admission/race-admission/schedule/", {
      statusCode: 409,
      body: {
        expected_updated_at: [
          "Planen ble endret av noen andre. Last inn på nytt.",
        ],
      },
    }).as("saveConflict");

    mountHarness(<DraftConflictHarness />, queryClient(), false);
    cy.tick(401);
    cy.wait("@saveConflict");
    cy.get("[data-cy=draft-save-state]").should("have.text", "conflict");
    cy.get("[data-cy=draft-conflicts]").should("have.text", "1");
    cy.get("[data-cy=draft-authority]").should("have.text", "server-newer");
    cy.get("[data-cy=draft-value]").should("have.text", "Local draft");
  });
});
