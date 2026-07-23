import React from "react";
import { createRoot } from "react-dom/client";

import RepairScenarioPanel from "../../frontend/src/components/Scheduling/Solver/RepairScenarioPanel";
import type { RepairScenario } from "../../frontend/src/components/Scheduling/Solver/repairScenarios";
import type { SolveResponse } from "../../frontend/src/components/Scheduling/Solver/solverHelpers";
import { useScheduleDraft } from "../../frontend/src/components/Scheduling/Solver/useScheduleDraft";
import ConflictReviewView from "../../frontend/src/routes/SchedulePage/ConflictReviewView";
import type {
  Candidate,
  InterviewAvailabilityParticipant,
} from "../../frontend/src/types";

const h = React.createElement;

const mountInPage = (element: React.ReactElement) => {
  cy.visit("/");
  cy.document().then((document) => {
    document.body.innerHTML = '<div id="component-root"></div>';
    const root = document.getElementById("component-root");
    if (!root) throw new Error("Component root was not created");
    createRoot(root).render(element);
  });
};

const candidates: Candidate[] = [
  { id: "candidate-1", name: "Ida Nordmann" },
  { id: "candidate-2", name: "Olav Hansen" },
];

const participant: InterviewAvailabilityParticipant = {
  user_id: "reviewer-1",
  username: "reviewer",
  full_name: "Ada Reviewer",
  slots: [],
  conflicts: [],
  reviewed_candidate_ids: [],
  proposed_candidate_ids: candidates.map((candidate) => candidate.id),
  conflict_review_complete: false,
  has_submitted: true,
  participation: "participating",
  needs_review: true,
  affected_assignment_count: 2,
  availability_generation: 1,
  is_me: true,
};

const repairScenario: RepairScenario = {
  baselineKey: "baseline-1",
  strategy: "minimum_change",
  result: {
    status: "SUCCESS",
    schedule: [
      {
        candidate_id: "candidate-1",
        candidate: "Ida Nordmann",
        time: 510,
        panel: [{ id: "reviewer-2", name: "Linnea", is_overtime: false }],
      },
    ],
  },
  metrics: {
    changedInterviews: 1,
    changedTimes: 1,
    affectedInterviewers: 1,
    brokenPanelBlocks: 0,
    overtimeDeltaMinutes: 0,
    workloadSpread: 0,
  },
  changes: [
    {
      candidate: "Ida Nordmann",
      beforeTime: 480,
      afterTime: 510,
      removedInterviewers: ["Ada"],
      addedInterviewers: ["Linnea"],
    },
  ],
};

const RepairHarness = () => {
  const [previewed, setPreviewed] = React.useState(false);
  const [applied, setApplied] = React.useState(false);
  return h(
    React.Fragment,
    null,
    h(
      "output",
      { "data-cy": "draft-state" },
      applied ? "applied" : "unchanged",
    ),
    h(RepairScenarioPanel, {
      open: true,
      onClose: () => undefined,
      conflictCount: 1,
      selectedStrategy: "minimum_change",
      onSelectedStrategyChange: () => undefined,
      scenarios: previewed ? [repairScenario] : [],
      selectedScenario: previewed ? repairScenario : undefined,
      onSelectScenario: () => undefined,
      onPreview: () => setPreviewed(true),
      onCompare: () => undefined,
      onApply: () => setApplied(true),
      loading: false,
      error: "",
      dates: ["2026-07-27"],
      sessionDuration: 30,
    }),
  );
};

const initialDraft: SolveResponse = {
  status: "SUCCESS",
  schedule: [
    {
      candidate_id: "candidate-1",
      candidate: "Ida Nordmann",
      time: 480,
      panel: [{ id: "reviewer-1", name: "Ada", is_overtime: false }],
    },
  ],
};

const DraftRestoreHarness = () => {
  const [result, setResult] = React.useState<SolveResponse | null>(
    initialDraft,
  );
  const [modifyCount, setModifyCount] = React.useState(0);
  const draft = useScheduleDraft({
    result,
    setResult,
    candidates,
    interviewers: [
      {
        id: "reviewer-1",
        name: "Ada",
        availability: [480, 510],
        biased: [],
        has_submitted: true,
      },
    ],
    dates: ["2026-07-27"],
    enabledSlots: new Set(["2026-07-27:480", "2026-07-27:510"]),
    sessionDuration: 30,
    canonicalBlocks: [[480, 510]],
    onModify: () => setModifyCount((count) => count + 1),
  });

  return h(
    React.Fragment,
    null,
    h("output", { "data-cy": "draft-time" }, result?.schedule[0]?.time),
    h("output", { "data-cy": "modify-count" }, modifyCount),
    h(
      "output",
      { "data-cy": "restore-available" },
      String(draft.canRestoreEditSession),
    ),
    h(
      "button",
      { type: "button", onClick: draft.beginEditSession },
      "Start editing",
    ),
    h(
      "button",
      { type: "button", onClick: () => draft.changeTime(0, "510") },
      "Change time",
    ),
    h(
      "button",
      { type: "button", onClick: draft.restoreEditSession },
      "Restore baseline",
    ),
  );
};

describe("focused Planutkast drawers", () => {
  it("opens candidate review on the first request even when mounted by navigation", () => {
    mountInPage(
      h(ConflictReviewView, {
        candidates,
        currentParticipant: participant,
        onSaveReview: () => Promise.resolve(),
        openRequestKey: 1,
        showSummary: false,
        reviewProgress: {
          complete: 0,
          total: 2,
          missingNames: ["Ada Reviewer", "Linnea"],
        },
      }),
    );

    cy.get("[data-cy=conflict-review]").should("not.exist");
    cy.get("[data-cy=conflict-review-drawer]").should("be.visible");
    cy.get("[data-cy=conflict-submit]").should(
      "contain.text",
      "Bekreft ingen inhabiliteter",
    );
    cy.get("[data-cy=conflict-candidate-candidate-1]").check();
    cy.get("[data-cy=conflict-submit]").should(
      "contain.text",
      "Bekreft kandidatkontroll",
    );
  });

  it("keeps the current draft unchanged until a repair preview is applied", () => {
    mountInPage(h(RepairHarness));

    cy.get("[data-cy=draft-state]").should("have.text", "unchanged");
    cy.contains("button", "Forhåndsvis løsning").click();
    cy.get("[data-cy=draft-state]").should("have.text", "unchanged");
    cy.contains("button", "Bruk denne løsningen").click();
    cy.get("[data-cy=draft-state]").should("have.text", "applied");
  });

  it("restores the edit-session baseline after an accidental change", () => {
    mountInPage(h(DraftRestoreHarness));

    cy.contains("button", "Start editing").click();
    cy.contains("button", "Change time").click();
    cy.get("[data-cy=draft-time]").should("have.text", "510");
    cy.get("[data-cy=restore-available]").should("have.text", "true");

    cy.contains("button", "Restore baseline").click();
    cy.get("[data-cy=draft-time]").should("have.text", "480");
    cy.get("[data-cy=restore-available]").should("have.text", "false");
    cy.get("[data-cy=modify-count]").should("have.text", "2");
  });
});
