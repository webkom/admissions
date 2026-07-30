import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";

import { DEFAULT_SOLVER_OPTIONS } from "../../frontend/src/components/Scheduling/Solver/solverHelpers";
import type { SolveResponse } from "../../frontend/src/components/Scheduling/Solver/solverHelpers";
import { useScheduleDraftPersistence } from "../../frontend/src/components/Scheduling/Solver/useScheduleDraftPersistence";
import { useDistributedPlanActions } from "../../frontend/src/routes/SchedulePage/useDistributedPlanActions";
import { useScheduleConfiguration } from "../../frontend/src/routes/SchedulePage/useScheduleConfiguration";
import { clearSensitiveAdmissionDataForScopeChange } from "../../frontend/src/query/sensitiveAccess";
import { buildInterviewOutreachTemplateStorageKey } from "../../frontend/src/query/sensitiveBrowserStorage";
import type { NameVisibility, SavedSchedule } from "../../frontend/src/types";
import { collectUnhandledRejections } from "../support/unhandledRejections";

const admissionSlug = "publication-reconciliation";
const scheduleUrl = `**/api/admin/admission/${admissionSlug}/schedule/`;
const scheduleQueryKey = [`/admin/admission/${admissionSlug}/schedule/`];

const savedSchedule = (
  isDistributed: boolean,
  nameVisibility: NameVisibility,
): SavedSchedule => ({
  id: 1,
  schedule: [
    {
      candidate_id: "candidate-1",
      candidate: "Candidate",
      time: 840,
      panel: [],
    },
  ],
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
  is_distributed: isDistributed,
  conflict_review_open: !isDistributed,
  name_visibility: nameVisibility,
  updated_at: isDistributed ? "revision-2" : "revision-1",
});

const TransitionHarness = ({
  schedule,
  draftPersistenceReady = true,
}: {
  schedule: SavedSchedule;
  draftPersistenceReady?: boolean;
}) => {
  const [outcome, setOutcome] = React.useState("idle");
  const [notice, setNotice] = React.useState("none");
  const actions = useDistributedPlanActions({
    admissionSlug,
    savedSchedule: schedule,
    draftPersistenceReady,
    notify: (message, tone) => setNotice(`${tone ?? "success"}:${message}`),
  });

  return (
    <div>
      <output data-cy="transition-outcome">{outcome}</output>
      <output data-cy="transition-error">
        {actions.planTransitionError || "none"}
      </output>
      <output data-cy="transition-notice">{notice}</output>
      <button
        type="button"
        onClick={async () => {
          const published = await actions.publishSchedule("admin_only");
          setOutcome(published ? "published" : "failed");
        }}
      >
        Publish
      </button>
    </div>
  );
};

const ScheduleConfigurationHarness = ({
  queryClient,
}: {
  queryClient: QueryClient;
}) => {
  const schedule = savedSchedule(false, "hidden");
  const configuration = useScheduleConfiguration({
    admissionSlug,
    savedSchedule: schedule,
    notify: () => undefined,
  });
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          void configuration.saveConfig({
            startDate: "2026-07-28",
            endDate: schedule.end_date,
            dayStartMinute: schedule.day_start_minute,
            dayEndMinute: schedule.day_end_minute,
            chunkSize: schedule.chunk_size,
            chunkBreakMinutes: schedule.chunk_break_minutes,
            slotOverrides: schedule.slot_overrides,
            enabledSlots: new Set(schedule.enabled_slots),
            enabledWindows: schedule.enabled_windows,
            expectedUpdatedAt: configuration.revision,
            sessionDuration: schedule.session_duration,
          })
        }
      >
        Save framework
      </button>
      <button
        type="button"
        onClick={() => void configuration.setConflictCollectionOpen(true)}
      >
        Open conflict collection
      </button>
      <button
        type="button"
        onClick={() =>
          clearSensitiveAdmissionDataForScopeChange(queryClient, admissionSlug)
        }
      >
        Revoke scheduler authority
      </button>
    </div>
  );
};

const AutosaveThenPublishHarness = () => {
  const [schedule, setSchedule] = React.useState(() =>
    savedSchedule(false, "hidden"),
  );
  const [result, setResult] = React.useState<SolveResponse>({
    status: "SUCCESS",
    schedule: schedule.schedule,
  });
  const [draftBaseRevision, setDraftBaseRevision] = React.useState(
    schedule.updated_at,
  );
  const [hasLocalDraft, setHasLocalDraft] = React.useState(false);
  const [outcome, setOutcome] = React.useState("idle");
  const [notice, setNotice] = React.useState("none");
  const persistence = useScheduleDraftPersistence({
    result,
    savedSchedule: schedule,
    hasLocalDraft,
    loading: false,
    solveTick: 0,
    draftBaseRevision,
    remoteRevisionChanged:
      hasLocalDraft && draftBaseRevision !== schedule.updated_at,
    config: {
      admissionSlug,
      startDate: schedule.start_date,
      endDate: schedule.end_date,
      sessionDuration: schedule.session_duration,
      enabledWindows: schedule.enabled_windows,
      enabledSlots: new Set(schedule.enabled_slots),
      dayStartMinute: schedule.day_start_minute,
      dayEndMinute: schedule.day_end_minute,
      chunkSize: schedule.chunk_size,
      chunkBreakMinutes: schedule.chunk_break_minutes,
      blockMode: schedule.block_mode,
      manualBlocks: schedule.manual_blocks,
      slotOverrides: schedule.slot_overrides,
      panelSize: schedule.panel_size,
      solverOptions: schedule.solver_options,
    },
    onConflict: () => setOutcome("conflict"),
    onRevisionSaved: (revision) => {
      setDraftBaseRevision(revision);
      setSchedule((current) => ({ ...current, updated_at: revision }));
    },
    onSaved: (revision) => {
      setSchedule((current) => ({
        ...current,
        schedule: result.schedule,
        updated_at: revision,
      }));
      setDraftBaseRevision(revision);
      setHasLocalDraft(false);
    },
  });
  const draftPersistenceReady =
    persistence.isSaved &&
    !persistence.isSaving &&
    !persistence.hasConflict &&
    !hasLocalDraft;
  const actions = useDistributedPlanActions({
    admissionSlug,
    savedSchedule: schedule,
    draftPersistenceReady,
    notify: (message, tone) => setNotice(`${tone ?? "success"}:${message}`),
  });

  return (
    <div>
      <output data-cy="persistence-state">{persistence.state}</output>
      <output data-cy="persistence-ready">
        {String(draftPersistenceReady)}
      </output>
      <output data-cy="persistence-error">{persistence.error || "none"}</output>
      <output data-cy="saved-revision">{schedule.updated_at}</output>
      <output data-cy="draft-base-revision">{draftBaseRevision}</output>
      <output data-cy="draft-candidate">
        {result.schedule[0]?.candidate ?? "none"}
      </output>
      <output data-cy="autosave-publish-outcome">{outcome}</output>
      <output data-cy="autosave-publish-notice">{notice}</output>
      <button
        type="button"
        onClick={() => {
          setResult({
            status: "SUCCESS",
            schedule: [
              {
                ...schedule.schedule[0],
                candidate: "Edited candidate",
              },
            ],
          });
          setHasLocalDraft(true);
        }}
      >
        Edit draft
      </button>
      <button
        type="button"
        onClick={() => {
          setResult({
            status: "SUCCESS",
            schedule: [
              {
                ...schedule.schedule[0],
                candidate: "Newest candidate",
              },
            ],
          });
          setHasLocalDraft(true);
        }}
      >
        Edit draft again
      </button>
      <button
        type="button"
        onClick={() => {
          setResult({
            status: "SUCCESS",
            schedule: schedule.schedule,
          });
          setHasLocalDraft(true);
        }}
      >
        Revert draft
      </button>
      <button
        type="button"
        onClick={() => {
          const remoteSchedule = {
            ...schedule,
            schedule: [
              {
                ...schedule.schedule[0],
                candidate: "Remote candidate",
              },
            ],
            updated_at: "revision-3",
          };
          setSchedule(remoteSchedule);
          setDraftBaseRevision(remoteSchedule.updated_at);
          setResult({
            status: "SUCCESS",
            schedule: remoteSchedule.schedule,
          });
          setHasLocalDraft(false);
        }}
      >
        Inject remote draft
      </button>
      <button
        type="button"
        onClick={() => {
          setResult({
            status: "SUCCESS",
            schedule: [
              {
                ...schedule.schedule[0],
                candidate: "Edited candidate",
              },
            ],
          });
          setHasLocalDraft(true);
        }}
      >
        Restore prior content
      </button>
      <button type="button" onClick={persistence.retry}>
        Retry draft save
      </button>
      <button
        type="button"
        onClick={async () => {
          const published = await actions.publishSchedule("admin_only");
          setOutcome(published ? "published" : "failed");
        }}
      >
        Publish edited draft
      </button>
    </div>
  );
};

const UnmountingAutosaveHarness = () => {
  const [isMounted, setIsMounted] = React.useState(true);
  return (
    <div>
      <button type="button" onClick={() => setIsMounted(false)}>
        Leave draft
      </button>
      {isMounted ? <AutosaveThenPublishHarness /> : <p>Different route</p>}
    </div>
  );
};

const queryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const mountHarness = (client: QueryClient, draftPersistenceReady = true) => {
  cy.visit("/api-auth/login/");
  cy.document().then((document) => {
    document.body.innerHTML = '<div id="transition-root"></div>';
    const root = document.getElementById("transition-root");
    if (!root) throw new Error("Transition harness root was not created");
    createRoot(root).render(
      <QueryClientProvider client={client}>
        <TransitionHarness
          schedule={savedSchedule(false, "hidden")}
          draftPersistenceReady={draftPersistenceReady}
        />
      </QueryClientProvider>,
    );
  });
};

const mountScheduleConfigurationHarness = (client: QueryClient) => {
  cy.visit("/api-auth/login/");
  cy.document().then((document) => {
    document.body.innerHTML = '<div id="transition-root"></div>';
    const root = document.getElementById("transition-root");
    if (!root) throw new Error("Transition harness root was not created");
    createRoot(root).render(
      <QueryClientProvider client={client}>
        <ScheduleConfigurationHarness queryClient={client} />
      </QueryClientProvider>,
    );
  });
};

const mountAutosaveHarness = (client: QueryClient) => {
  cy.visit("/api-auth/login/");
  cy.document().then((document) => {
    document.body.innerHTML = '<div id="transition-root"></div>';
    const root = document.getElementById("transition-root");
    if (!root) throw new Error("Transition harness root was not created");
    createRoot(root).render(
      <QueryClientProvider client={client}>
        <AutosaveThenPublishHarness />
      </QueryClientProvider>,
    );
  });
};

const mountUnmountingAutosaveHarness = (client: QueryClient) => {
  cy.visit("/api-auth/login/");
  cy.document().then((document) => {
    document.body.innerHTML = '<div id="transition-root"></div>';
    const root = document.getElementById("transition-root");
    if (!root) throw new Error("Transition harness root was not created");
    createRoot(root).render(
      <QueryClientProvider client={client}>
        <UnmountingAutosaveHarness />
      </QueryClientProvider>,
    );
  });
};

describe("distributed plan transition reconciliation", () => {
  it("saves framework changes without resubmitting the current plan", () => {
    const client = queryClient();
    cy.intercept("POST", scheduleUrl, (request) => {
      request.reply({
        statusCode: 200,
        body: { ...savedSchedule(false, "hidden"), updated_at: "revision-2" },
      });
    }).as("frameworkSave");

    mountScheduleConfigurationHarness(client);
    cy.contains("button", "Save framework").click();
    cy.wait("@frameworkSave")
      .its("request.body")
      .should((body) => {
        expect(body).not.to.have.property("schedule");
        expect(body.start_date).to.equal("2026-07-28");
      });
  });

  it("contains a conflict-collection response after authority changes", () => {
    const client = queryClient();
    let releaseSave: (() => void) | null = null;
    cy.intercept("POST", scheduleUrl, (request) => {
      return new Promise<void>((resolve) => {
        releaseSave = () => {
          request.reply({
            statusCode: 200,
            body: {
              ...savedSchedule(false, "hidden"),
              conflict_collection_open: true,
              updated_at: "revision-2",
            },
          });
          resolve();
        };
      });
    }).as("conflictCollectionSave");

    mountScheduleConfigurationHarness(client);
    collectUnhandledRejections().as("unhandledRejections");
    cy.contains("button", "Open conflict collection").click();
    cy.wrap(null).should(() => expect(releaseSave).to.be.a("function"));
    cy.contains("button", "Revoke scheduler authority").click();
    cy.then(() => releaseSave?.());
    cy.wait("@conflictCollectionSave");
    cy.window().then(
      (window) =>
        new Cypress.Promise<void>((resolve) => window.setTimeout(resolve, 0)),
    );
    cy.get<unknown[]>("@unhandledRejections").should("have.length", 0);
  });

  it("flushes a pending draft save before the scheduler unmounts", () => {
    const client = queryClient();
    cy.intercept("POST", scheduleUrl, (request) => {
      request.reply({
        statusCode: 200,
        body: {
          ...savedSchedule(false, "hidden"),
          schedule: request.body.schedule,
          updated_at: "revision-2",
        },
      });
    }).as("unmountDraftSave");

    mountUnmountingAutosaveHarness(client);
    cy.contains("button", "Edit draft").click();
    cy.contains("button", "Leave draft").click();
    cy.wait("@unmountDraftSave")
      .its("request.body.schedule.0.candidate")
      .should("equal", "Edited candidate");
    cy.contains("Different route").should("exist");
  });

  it("does not send publication while the live draft is not durably saved", () => {
    const client = queryClient();
    let publishRequests = 0;
    cy.intercept("POST", scheduleUrl, (request) => {
      publishRequests += 1;
      request.reply({ statusCode: 200, body: savedSchedule(true, "hidden") });
    });

    mountHarness(client, false);
    cy.contains("button", "Publish").click();

    cy.get('[data-cy="transition-outcome"]').should("have.text", "failed");
    cy.get('[data-cy="transition-notice"]').should(
      "contain.text",
      "Vent til de siste endringene",
    );
    cy.then(() => expect(publishRequests).to.equal(0));
  });

  it("publishes only after the real autosave callback advances the revision", () => {
    const client = queryClient();
    let writeCount = 0;
    cy.intercept("POST", scheduleUrl, (request) => {
      writeCount += 1;
      if (writeCount === 1) {
        request.reply({
          statusCode: 200,
          body: {
            ...savedSchedule(false, "hidden"),
            schedule: request.body.schedule,
            updated_at: "revision-2",
          },
        });
        return;
      }
      request.reply({
        statusCode: 200,
        body: {
          ...savedSchedule(true, "admin_only"),
          schedule: [
            {
              ...savedSchedule(true, "admin_only").schedule[0],
              candidate: "Edited candidate",
            },
          ],
          updated_at: "revision-3",
        },
      });
    }).as("scheduleWrite");

    mountAutosaveHarness(client);
    cy.get('[data-cy="persistence-ready"]').should("have.text", "true");
    cy.contains("button", "Edit draft").click();
    cy.get('[data-cy="persistence-ready"]').should("have.text", "false");
    cy.wait("@scheduleWrite").its("request.body").should("deep.include", {
      is_distributed: false,
      expected_updated_at: "revision-1",
    });
    cy.get("@scheduleWrite")
      .its("request.body.schedule.0.candidate")
      .should("equal", "Edited candidate");
    cy.get('[data-cy="persistence-state"]').should("have.text", "saved");
    cy.get('[data-cy="saved-revision"]').should("have.text", "revision-2");
    cy.get('[data-cy="persistence-ready"]').should("have.text", "true");

    cy.contains("button", "Publish edited draft").click();
    cy.wait("@scheduleWrite").its("request.body").should("deep.include", {
      is_distributed: true,
      name_visibility: "admin_only",
      expected_updated_at: "revision-2",
    });
    cy.get('[data-cy="autosave-publish-outcome"]').should(
      "have.text",
      "published",
    );
    cy.get('[data-cy="autosave-publish-notice"]').should(
      "contain.text",
      "Intervjuplanen er publisert",
    );
  });

  it("keeps publication blocked when the newest queued autosave fails", () => {
    const client = queryClient();
    let writeCount = 0;
    cy.intercept("POST", scheduleUrl, (request) => {
      writeCount += 1;
      if (writeCount === 1) {
        request.reply({
          delay: 700,
          statusCode: 200,
          body: {
            ...savedSchedule(false, "hidden"),
            schedule: request.body.schedule,
            updated_at: "revision-2",
          },
        });
        return;
      }
      if (writeCount === 2) {
        request.reply({
          statusCode: 500,
          body: { detail: "Temporary save failure" },
        });
        return;
      }
      if (writeCount === 3) {
        request.reply({
          statusCode: 200,
          body: {
            ...savedSchedule(false, "hidden"),
            schedule: request.body.schedule,
            updated_at: "revision-3",
          },
        });
        return;
      }
      request.reply({
        statusCode: 200,
        body: {
          ...savedSchedule(true, "admin_only"),
          schedule: request.body.schedule,
          updated_at: "revision-4",
        },
      });
    }).as("queuedScheduleWrite");

    mountAutosaveHarness(client);
    cy.contains("button", "Edit draft").click();
    cy.wrap(null).should(() => expect(writeCount).to.equal(1));
    cy.contains("button", "Edit draft again").click();
    cy.wait("@queuedScheduleWrite");
    cy.wait("@queuedScheduleWrite");

    cy.get('[data-cy="persistence-state"]').should("have.text", "error");
    cy.get('[data-cy="persistence-error"]').should(
      "contain.text",
      "Kunne ikke lagre utkastet",
    );
    cy.get('[data-cy="saved-revision"]').should("have.text", "revision-2");
    cy.get('[data-cy="draft-base-revision"]').should("have.text", "revision-2");
    cy.get('[data-cy="persistence-ready"]').should("have.text", "false");

    cy.contains("button", "Publish edited draft").click();
    cy.get('[data-cy="autosave-publish-outcome"]').should(
      "have.text",
      "failed",
    );
    cy.then(() => expect(writeCount).to.equal(2));

    cy.intercept("GET", scheduleUrl, {
      statusCode: 200,
      body: {
        ...savedSchedule(false, "hidden"),
        schedule: [
          {
            ...savedSchedule(false, "hidden").schedule[0],
            candidate: "Newest candidate",
          },
        ],
        updated_at: "revision-3",
      },
    }).as("reconcileDraftSave");
    cy.contains("button", "Retry draft save").click();
    cy.wait("@reconcileDraftSave");
    cy.then(() => expect(writeCount).to.equal(2));
    cy.get('[data-cy="persistence-state"]').should("have.text", "saved");
    cy.get('[data-cy="saved-revision"]').should("have.text", "revision-3");
    cy.get('[data-cy="persistence-ready"]').should("have.text", "true");

    cy.contains("button", "Publish edited draft").click();
    cy.wait("@queuedScheduleWrite").its("request.body").should("deep.include", {
      is_distributed: true,
      expected_updated_at: "revision-3",
    });
    cy.get('[data-cy="autosave-publish-outcome"]').should(
      "have.text",
      "published",
    );
  });

  it("does not resend an ambiguous draft write when canonical state differs", () => {
    const client = queryClient();
    let writeCount = 0;
    cy.intercept("POST", scheduleUrl, (request) => {
      writeCount += 1;
      request.reply({
        statusCode: 500,
        body: { detail: "Temporary save failure" },
      });
    }).as("ambiguousDraftWrite");
    cy.intercept("GET", scheduleUrl, {
      statusCode: 200,
      body: {
        ...savedSchedule(false, "hidden"),
        schedule: [
          {
            ...savedSchedule(false, "hidden").schedule[0],
            candidate: "Someone else",
          },
        ],
        updated_at: "revision-2",
      },
    }).as("differentCanonicalDraft");

    mountAutosaveHarness(client);
    cy.contains("button", "Edit draft").click();
    cy.wait("@ambiguousDraftWrite");
    cy.get('[data-cy="persistence-state"]').should("have.text", "error");

    cy.contains("button", "Retry draft save").click();
    cy.wait("@differentCanonicalDraft");
    cy.then(() => expect(writeCount).to.equal(1));
    cy.get('[data-cy="persistence-state"]').should("have.text", "conflict");
  });

  it("queues an undo behind a different in-flight save", () => {
    const client = queryClient();
    let writeCount = 0;
    cy.intercept("POST", scheduleUrl, (request) => {
      writeCount += 1;
      request.reply({
        delay: writeCount === 2 ? 700 : 0,
        statusCode: 200,
        body: {
          ...savedSchedule(false, "hidden"),
          schedule: request.body.schedule,
          updated_at: `revision-${writeCount + 1}`,
        },
      });
    }).as("undoScheduleWrite");

    mountAutosaveHarness(client);
    cy.contains("button", "Edit draft").click();
    cy.wait("@undoScheduleWrite").then(({ request }) => {
      expect(request.body.schedule[0].candidate).to.equal("Edited candidate");
      expect(request.body.expected_updated_at).to.equal("revision-1");
    });
    cy.get('[data-cy="persistence-ready"]').should("have.text", "true");

    cy.contains("button", "Edit draft again").click();
    cy.wrap(null).should(() => expect(writeCount).to.equal(2));
    cy.contains("button", "Revert draft").click();
    cy.get('[data-cy="draft-candidate"]').should(
      "have.text",
      "Edited candidate",
    );

    cy.wait("@undoScheduleWrite").then(({ request }) => {
      expect(request.body.schedule[0].candidate).to.equal("Newest candidate");
      expect(request.body.expected_updated_at).to.equal("revision-2");
    });
    cy.wait("@undoScheduleWrite").then(({ request }) => {
      expect(request.body.schedule[0].candidate).to.equal("Edited candidate");
      expect(request.body.expected_updated_at).to.equal("revision-3");
    });
    cy.get('[data-cy="persistence-state"]').should("have.text", "saved");
    cy.get('[data-cy="saved-revision"]').should("have.text", "revision-4");
    cy.get('[data-cy="draft-base-revision"]').should("have.text", "revision-4");
    cy.get('[data-cy="persistence-ready"]').should("have.text", "true");
  });

  it("drops a queued undo when the UI returns to the in-flight draft", () => {
    const client = queryClient();
    let writeCount = 0;
    cy.intercept("POST", scheduleUrl, (request) => {
      writeCount += 1;
      request.reply({
        delay: writeCount === 2 ? 700 : 0,
        statusCode: 200,
        body: {
          ...savedSchedule(false, "hidden"),
          schedule: request.body.schedule,
          updated_at: `revision-${writeCount + 1}`,
        },
      });
    }).as("coalescedScheduleWrite");

    mountAutosaveHarness(client);
    cy.contains("button", "Edit draft").click();
    cy.wait("@coalescedScheduleWrite");
    cy.contains("button", "Edit draft again").click();
    cy.wrap(null).should(() => expect(writeCount).to.equal(2));

    cy.contains("button", "Revert draft").click();
    cy.get('[data-cy="draft-candidate"]').should(
      "have.text",
      "Edited candidate",
    );
    cy.contains("button", "Edit draft again").click();
    cy.get('[data-cy="draft-candidate"]').should(
      "have.text",
      "Newest candidate",
    );

    cy.wait("@coalescedScheduleWrite").then(({ request }) => {
      expect(request.body.schedule[0].candidate).to.equal("Newest candidate");
      expect(request.body.expected_updated_at).to.equal("revision-2");
    });
    cy.get('[data-cy="persistence-state"]').should("have.text", "saved");
    cy.get('[data-cy="saved-revision"]').should("have.text", "revision-3");
    cy.get('[data-cy="persistence-ready"]').should("have.text", "true");
    cy.wait(500);
    cy.then(() => expect(writeCount).to.equal(2));
  });

  it("does not reuse a historical fingerprint after the canonical revision changes", () => {
    const client = queryClient();
    let writeCount = 0;
    cy.intercept("POST", scheduleUrl, (request) => {
      writeCount += 1;
      request.reply({
        statusCode: 200,
        body: {
          ...savedSchedule(false, "hidden"),
          schedule: request.body.schedule,
          updated_at: writeCount === 1 ? "revision-2" : "revision-4",
        },
      });
    }).as("revisionScopedWrite");

    mountAutosaveHarness(client);
    cy.contains("button", "Edit draft").click();
    cy.wait("@revisionScopedWrite");
    cy.get('[data-cy="persistence-ready"]').should("have.text", "true");

    cy.contains("button", "Inject remote draft").click();
    cy.get('[data-cy="saved-revision"]').should("have.text", "revision-3");
    cy.get('[data-cy="draft-candidate"]').should(
      "have.text",
      "Remote candidate",
    );
    cy.contains("button", "Restore prior content").click();
    cy.get('[data-cy="persistence-ready"]').should("have.text", "false");

    cy.wait("@revisionScopedWrite").then(({ request }) => {
      expect(request.body.schedule[0].candidate).to.equal("Edited candidate");
      expect(request.body.expected_updated_at).to.equal("revision-3");
    });
    cy.get('[data-cy="persistence-state"]').should("have.text", "saved");
    cy.get('[data-cy="saved-revision"]').should("have.text", "revision-4");
    cy.get('[data-cy="persistence-ready"]').should("have.text", "true");
  });

  it("confirms a compensating revert after a failed write", () => {
    const client = queryClient();
    let writeCount = 0;
    cy.intercept("POST", scheduleUrl, (request) => {
      writeCount += 1;
      if (writeCount === 2) {
        request.reply({
          statusCode: 503,
          body: { detail: "Temporary save failure" },
        });
        return;
      }
      request.reply({
        statusCode: 200,
        body: {
          ...savedSchedule(false, "hidden"),
          schedule: request.body.schedule,
          updated_at: `revision-${writeCount + 1}`,
        },
      });
    }).as("ambiguousScheduleWrite");

    mountAutosaveHarness(client);
    cy.contains("button", "Edit draft").click();
    cy.wait("@ambiguousScheduleWrite");
    cy.contains("button", "Edit draft again").click();
    cy.wait("@ambiguousScheduleWrite");
    cy.get('[data-cy="persistence-state"]').should("have.text", "error");
    cy.get('[data-cy="persistence-ready"]').should("have.text", "false");

    cy.contains("button", "Revert draft").click();
    cy.get('[data-cy="persistence-ready"]').should("have.text", "false");
    cy.wait("@ambiguousScheduleWrite").then(({ request }) => {
      expect(request.body.schedule[0].candidate).to.equal("Edited candidate");
      expect(request.body.expected_updated_at).to.equal("revision-2");
    });
    cy.get('[data-cy="persistence-state"]').should("have.text", "saved");
    cy.get('[data-cy="saved-revision"]').should("have.text", "revision-4");
    cy.get('[data-cy="persistence-ready"]').should("have.text", "true");
  });

  it("converges to published after the commit succeeds but the response is lost", () => {
    const client = queryClient();
    cy.intercept("POST", scheduleUrl, { forceNetworkError: true }).as(
      "lostPublishResponse",
    );
    cy.intercept("GET", scheduleUrl, {
      statusCode: 200,
      body: savedSchedule(true, "admin_only"),
    }).as("reconcilePublication");

    mountHarness(client);
    cy.contains("button", "Publish").click();
    cy.wait("@lostPublishResponse").its("request.body").should("deep.include", {
      is_distributed: true,
      name_visibility: "admin_only",
      expected_updated_at: "revision-1",
    });
    cy.wait("@reconcilePublication");

    cy.get('[data-cy="transition-outcome"]').should("have.text", "published");
    cy.get('[data-cy="transition-error"]').should("have.text", "none");
    cy.get('[data-cy="transition-notice"]').should(
      "contain.text",
      "Intervjuplanen er publisert",
    );
    cy.then(() => {
      expect(
        client.getQueryData<SavedSchedule>(scheduleQueryKey),
      ).to.deep.include({
        is_distributed: true,
        name_visibility: "admin_only",
        updated_at: "revision-2",
      });
    });
  });

  it("treats a retry conflict as success only when canonical state matches", () => {
    const client = queryClient();
    cy.intercept("POST", scheduleUrl, {
      statusCode: 409,
      body: { detail: "Planen ble endret." },
    }).as("publishConflict");
    cy.intercept("GET", scheduleUrl, {
      statusCode: 200,
      body: savedSchedule(true, "admin_only"),
    }).as("reconcilePublication");

    mountHarness(client);
    cy.contains("button", "Publish").click();
    cy.wait("@publishConflict");
    cy.wait("@reconcilePublication");

    cy.get('[data-cy="transition-outcome"]').should("have.text", "published");
    cy.get('[data-cy="transition-error"]').should("have.text", "none");
  });

  it("keeps a retry conflict when canonical publication state differs", () => {
    const client = queryClient();
    const concurrentlyPublished = savedSchedule(true, "admin_only");
    concurrentlyPublished.schedule = [
      {
        candidate_id: "candidate-2",
        candidate: "Different candidate",
        time: 840,
        panel: [],
      },
    ];
    cy.intercept("POST", scheduleUrl, {
      statusCode: 409,
      body: { detail: "Planen ble endret." },
    }).as("publishConflict");
    cy.intercept("GET", scheduleUrl, {
      statusCode: 200,
      body: concurrentlyPublished,
    }).as("reconcilePublication");

    mountHarness(client);
    cy.contains("button", "Publish").click();
    cy.wait("@publishConflict");
    cy.wait("@reconcilePublication");

    cy.get('[data-cy="transition-outcome"]').should("have.text", "failed");
    cy.get('[data-cy="transition-error"]').should(
      "contain.text",
      "Planen ble endret",
    );
    cy.get('[data-cy="transition-notice"]').should(
      "contain.text",
      "error:Planen ble endret",
    );
  });

  it("reports an unknown state when neither the write nor reconciliation is observable", () => {
    const client = queryClient();
    cy.intercept("POST", scheduleUrl, { forceNetworkError: true }).as(
      "lostPublishResponse",
    );
    cy.intercept("GET", scheduleUrl, { forceNetworkError: true }).as(
      "lostReconciliation",
    );

    mountHarness(client);
    cy.contains("button", "Publish").click();
    cy.wait("@lostPublishResponse");
    cy.wait("@lostReconciliation");

    cy.get('[data-cy="transition-outcome"]').should("have.text", "failed");
    cy.get('[data-cy="transition-error"]').should(
      "contain.text",
      "Publiseringsstatusen kunne ikke kontrolleres",
    );
    cy.get('[data-cy="transition-notice"]').should(
      "contain.text",
      "Oppdater siden før du prøver igjen",
    );
  });

  it("purges admission scope when publish reconciliation reports not found", () => {
    const client = queryClient();
    const templateKey = buildInterviewOutreachTemplateStorageKey(
      admissionSlug,
      "admin-actor",
      "webkom",
    );
    client
      .getQueryCache()
      .build(client, {
        queryKey: scheduleQueryKey,
        meta: { sensitive: true, admissionSlug },
      })
      .setData(savedSchedule(false, "hidden"));
    cy.intercept("POST", scheduleUrl, { forceNetworkError: true }).as(
      "lostPublishResponse",
    );
    cy.intercept("GET", scheduleUrl, {
      statusCode: 404,
      body: { detail: "Not found" },
    }).as("missingReconciliation");

    mountHarness(client);
    cy.window().then((window) => {
      window.localStorage.setItem(templateKey, "Private outreach text");
    });
    cy.contains("button", "Publish").click();
    cy.wait("@lostPublishResponse");
    cy.wait("@missingReconciliation");

    cy.get('[data-cy="transition-outcome"]').should("have.text", "failed");
    cy.get('[data-cy="transition-notice"]').should(
      "contain.text",
      "Tilgangen til intervjuplanleggingen",
    );
    cy.then(() => {
      expect(client.getQueryData(scheduleQueryKey)).to.equal(undefined);
    });
    cy.window().then((window) => {
      expect(window.localStorage.getItem(templateKey)).to.equal(null);
    });
  });
});
