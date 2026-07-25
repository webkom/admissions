import React from "react";
import { createRoot } from "react-dom/client";

import RepairScenarioPanel from "../../frontend/src/components/Scheduling/Solver/RepairScenarioPanel";
import PanelMemberChips from "../../frontend/src/components/Scheduling/Solver/PanelMemberChips";
import type { AssignmentConflictSummary } from "../../frontend/src/components/Scheduling/Solver/assignmentConflicts";
import type { RepairScenario } from "../../frontend/src/components/Scheduling/Solver/repairScenarios";
import type { SolveResponse } from "../../frontend/src/components/Scheduling/Solver/solverHelpers";
import { useScheduleDraft } from "../../frontend/src/components/Scheduling/Solver/useScheduleDraft";
import ConflictCollectionPanel from "../../frontend/src/routes/SchedulePage/ConflictCollectionPanel";
import ConflictReviewView from "../../frontend/src/routes/SchedulePage/ConflictReviewView";
import type {
  Candidate,
  InterviewAvailabilityParticipant,
  ScheduleItem,
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

const ConflictReviewHarness = () => {
  const [openRequestKey, setOpenRequestKey] = React.useState(1);
  return h(
    React.Fragment,
    null,
    h(
      "button",
      {
        type: "button",
        "data-cy": "reopen-conflict-review",
        onClick: () => setOpenRequestKey((key) => key + 1),
      },
      "Kontroller kandidater igjen",
    ),
    h(ConflictReviewView, {
      candidates,
      currentParticipant: participant,
      onSaveReview: () => Promise.resolve(),
      openRequestKey,
      showSummary: false,
      reviewProgress: {
        complete: 0,
        total: 2,
        missingNames: ["Ada Reviewer", "Linnea"],
      },
    }),
  );
};

const ConflictCorrectionHarness = () => {
  const [currentParticipant, setCurrentParticipant] = React.useState({
    ...participant,
    conflicts: ["candidate-1"],
    reviewed_candidate_ids: candidates.map((candidate) => candidate.id),
    conflict_review_complete: true,
  });
  const [savedConflicts, setSavedConflicts] = React.useState(
    currentParticipant.conflicts.join(","),
  );
  const [savedReviewedCandidates, setSavedReviewedCandidates] = React.useState(
    currentParticipant.reviewed_candidate_ids.join(","),
  );

  return h(
    React.Fragment,
    null,
    h(ConflictReviewView, {
      candidates,
      currentParticipant,
      onSaveReview: (reviewedCandidateIds, conflictIds) => {
        setCurrentParticipant((current) => ({
          ...current,
          reviewed_candidate_ids: reviewedCandidateIds,
          conflicts: conflictIds,
          conflict_review_complete: true,
        }));
        setSavedConflicts(conflictIds.join(","));
        setSavedReviewedCandidates(reviewedCandidateIds.join(","));
        return Promise.resolve();
      },
    }),
    h(
      "span",
      {
        "data-cy": "saved-conflicts",
      },
      savedConflicts || "none",
    ),
    h(
      "span",
      {
        "data-cy": "saved-reviewed-candidates",
      },
      savedReviewedCandidates,
    ),
  );
};

const ConflictCollectionHarness = () => {
  const [savedReviewedCandidates, setSavedReviewedCandidates] =
    React.useState("");

  return h(
    React.Fragment,
    null,
    h(
      ConflictCollectionPanel,
      {
        open: true,
        participantCount: 2,
        completedCount: 1,
        candidateCount: 2,
        saving: false,
        onToggle: () => undefined,
      },
      h(ConflictReviewView, {
        candidates,
        currentParticipant: {
          ...participant,
          reviewed_candidate_ids: ["candidate-1"],
          conflict_collection_candidate_ids: ["candidate-2"],
          conflict_collection_revision: "collection-revision",
          conflict_collection_complete: false,
        },
        scope: "collection",
        onSaveReview: (reviewedCandidateIds) => {
          setSavedReviewedCandidates(reviewedCandidateIds.join(","));
          return Promise.resolve();
        },
      }),
    ),
    h(
      "output",
      { "data-cy": "collection-reviewed-candidates" },
      savedReviewedCandidates,
    ),
  );
};

const EmptyConflictCollectionHarness = () => {
  const [savedValue, setSavedValue] = React.useState("not-saved");
  return h(
    React.Fragment,
    null,
    h(ConflictReviewView, {
      candidates: [],
      currentParticipant: {
        ...participant,
        conflicts: [],
        conflict_collection_candidate_ids: [],
        conflict_collection_revision: "collection-revision",
        conflict_collection_complete: false,
      },
      scope: "collection",
      onSaveReview: (reviewedCandidateIds, conflictIds) => {
        setSavedValue(`${reviewedCandidateIds.length}:${conflictIds.length}`);
        return Promise.resolve();
      },
    }),
    h("output", { "data-cy": "empty-collection-saved" }, savedValue),
  );
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
  applicable: true,
  unplacedCandidates: [],
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

const incompleteRepairScenario: RepairScenario = {
  ...repairScenario,
  strategy: "balanced",
  result: {
    status: "PARTIAL",
    schedule: [],
    unplaceable: [
      {
        candidate_id: "candidate-1",
        candidate: "Ida Nordmann",
      },
    ],
  },
  applicable: false,
  unplacedCandidates: ["Ida Nordmann"],
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
      scenarios: previewed ? [repairScenario, incompleteRepairScenario] : [],
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

const RepairEscapeHarness = () => {
  const [open, setOpen] = React.useState(false);
  return h(
    React.Fragment,
    null,
    h(
      "button",
      {
        type: "button",
        "data-cy": "repair-opener",
        onClick: () => setOpen(true),
      },
      "Åpne reparasjon",
    ),
    h(RepairScenarioPanel, {
      open,
      onClose: () => setOpen(false),
      conflictCount: 1,
      selectedStrategy: "minimum_change",
      onSelectedStrategyChange: () => undefined,
      scenarios: [],
      onSelectScenario: () => undefined,
      onPreview: () => undefined,
      onCompare: () => undefined,
      onApply: () => undefined,
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

const panelStatusItem: ScheduleItem = {
  candidate: "Ida Nordmann",
  time: 480,
  panel: [
    { id: "reviewer-opted-out", name: "Ada", is_overtime: false },
    { id: "reviewer-conflicted", name: "Linnea", is_overtime: false },
  ],
};

const panelStatusConflicts: AssignmentConflictSummary = {
  assignmentCount: 1,
  affectedCandidateIds: new Set(),
  affectedCandidateNames: new Set([panelStatusItem.candidate]),
  affectedScheduleIndexes: new Set([0]),
  affectedPanelMemberKeys: new Set([
    "0:reviewer-opted-out",
    "0:reviewer-conflicted",
  ]),
  optedOutPanelMemberKeys: new Set(["0:reviewer-opted-out"]),
};

const PanelMemberStatusHarness = () => {
  const panelMemberProps = {
    item: panelStatusItem,
    scheduleIndex: 0,
    canEditDraft: false,
    interviewerOptions: [],
    availabilityStatusFor: () => "verified" as const,
    assignmentConflicts: panelStatusConflicts,
    onSwapPanelMember: () => undefined,
  };

  return h(
    React.Fragment,
    null,
    h(
      "section",
      { "data-cy": "list-panel-members" },
      h(PanelMemberChips, panelMemberProps),
    ),
    h(
      "section",
      { "data-cy": "calendar-panel-members" },
      h(PanelMemberChips, panelMemberProps),
    ),
  );
};

describe("focused Planutkast interactions", () => {
  it("opens candidate review inline on the first navigation request", () => {
    cy.viewport(1280, 900);
    mountInPage(h(ConflictReviewHarness));

    cy.get("[data-cy=conflict-review]").should("not.exist");
    cy.get("[data-cy=conflict-review-inline]")
      .should("be.visible")
      .and("not.have.attr", "role", "dialog");
    cy.get("[data-cy=conflict-review-drawer]").should("not.exist");
    cy.get("[data-cy=conflict-review-heading]").should("be.focused");
    cy.get("[data-cy=reopen-conflict-review]").click();
    cy.get("[data-cy=conflict-review-heading]").should("be.focused");
    cy.get("[data-cy=conflict-submit]").should(
      "contain.text",
      "Bekreft ingen inhabiliteter",
    );
    cy.get("[data-cy=conflict-candidate-candidate-1]").check();
    cy.get("[data-cy=conflict-submit]").should(
      "contain.text",
      "Bekreft kandidatkontroll",
    );
    cy.screenshot("scheduler-workflow/05-candidate-review", {
      capture: "viewport",
    });
    cy.get("[data-cy=conflict-review-heading]").focus().type("{esc}");
    cy.get("[data-cy=conflict-review-inline]").should("not.exist");
    cy.get("[data-cy=reopen-conflict-review]").should("be.focused");
  });

  it("reopens a completed review so a wrongly marked conflict can be removed", () => {
    mountInPage(h(ConflictCorrectionHarness));

    cy.get("[data-cy=conflict-review-open]")
      .should("contain.text", "Se eller endre svar")
      .click();
    cy.get("[data-cy=conflict-candidate-candidate-1]").should("be.checked");
    cy.get("[data-cy=conflict-submit]").should("be.disabled");
    cy.get("[data-cy=conflict-candidate-candidate-1]").uncheck();
    cy.get("[data-cy=conflict-submit]")
      .should("contain.text", "Bekreft ingen inhabiliteter")
      .and("be.enabled")
      .click();

    cy.get("[data-cy=saved-conflicts]").should("have.text", "none");
    cy.get("[data-cy=saved-reviewed-candidates]").should(
      "have.text",
      "candidate-1,candidate-2",
    );
    cy.get("[data-cy=conflict-review-inline]").should("not.exist");
    cy.get("[data-cy=conflict-review-open]").should(
      "contain.text",
      "Se eller endre svar",
    );
  });

  it("limits candidate review to the current proposal scope", () => {
    mountInPage(
      h(ConflictReviewView, {
        candidates,
        currentParticipant: {
          ...participant,
          proposed_candidate_ids: ["candidate-1"],
          affected_assignment_count: 1,
        },
        onSaveReview: () => Promise.resolve(),
        openRequestKey: 1,
        showSummary: false,
      }),
    );

    cy.get("[data-cy=conflict-review-inline]")
      .should("be.visible")
      .and("contain.text", "Velg kandidatene du er inhabil for");
    cy.get("[data-cy=conflict-candidate-candidate-1]").should("exist");
    cy.contains("Olav Hansen").should("not.exist");
    cy.contains("Har du en annen kjent inhabilitet?").should("not.exist");
  });

  it("uses the opened collection snapshot and requires every participant before closing", () => {
    mountInPage(h(ConflictCollectionHarness));

    cy.get("[data-cy=toggle-conflict-collection]")
      .should("be.disabled")
      .and("contain.text", "Fullfør og lukk navn");
    cy.get("[data-cy=conflict-review-open]").click();
    cy.get("[data-cy=conflict-candidate-candidate-2]").should("exist");
    cy.get("[data-cy=conflict-candidate-candidate-1]").should("not.exist");
    cy.get("[data-cy=conflict-submit]").click();
    cy.get("[data-cy=collection-reviewed-candidates]").should(
      "have.text",
      "candidate-2",
    );
  });

  it("lets a self-only participant confirm an empty candidate scope", () => {
    mountInPage(h(EmptyConflictCollectionHarness));

    cy.get("[data-cy=conflict-review]")
      .should("contain.text", "Du har ingen andre kandidater å kontrollere")
      .find("[data-cy=conflict-review-open]")
      .click();
    cy.get("[data-cy=conflict-submit]")
      .should("contain.text", "Bekreft ingen inhabiliteter")
      .click();
    cy.get("[data-cy=empty-collection-saved]").should("have.text", "0:0");
  });

  it("lets an admin close a stale collection before reopening it", () => {
    mountInPage(
      h(ConflictCollectionPanel, {
        open: true,
        participantCount: 2,
        completedCount: 0,
        candidateCount: 3,
        saving: false,
        stale: true,
        onToggle: () => undefined,
      }),
    );

    cy.get("[data-cy=toggle-conflict-collection]")
      .should("be.enabled")
      .and("contain.text", "Lukk utdaterte navn");
    cy.get("[data-cy=conflict-collection]").should(
      "contain.text",
      "Kontrollen må startes på nytt",
    );
  });

  it("keeps the current draft unchanged until a repair preview is applied", () => {
    cy.viewport(1280, 900);
    mountInPage(h(RepairHarness));

    cy.get("[data-cy=repair-schedule-inline]")
      .should("be.visible")
      .and("not.have.attr", "role", "dialog");
    cy.get("[data-cy=repair-schedule-drawer]").should("not.exist");
    cy.get("[data-cy=draft-state]").should("have.text", "unchanged");
    cy.contains("button", "Forhåndsvis løsning").click();
    cy.get("[data-cy=draft-state]").should("have.text", "unchanged");
    cy.get("[data-cy=repair-scenario-balanced]")
      .should("be.disabled")
      .and("contain.text", "Ida Nordmann står uten intervju");
    cy.screenshot("scheduler-workflow/06-repair-preview", {
      capture: "viewport",
    });
    cy.contains("button", "Bruk denne løsningen").click();
    cy.get("[data-cy=draft-state]").should("have.text", "applied");
  });

  it("moves focus into repair and restores its opener on Escape", () => {
    mountInPage(h(RepairEscapeHarness));

    cy.get("[data-cy=repair-opener]").click();
    cy.get("[data-cy=repair-schedule-heading]").should("be.focused");
    cy.get("[data-cy=repair-schedule-heading]").type("{esc}");
    cy.get("[data-cy=repair-schedule-inline]").should("not.exist");
    cy.get("[data-cy=repair-opener]").should("be.focused");
  });

  it("announces repair progress and failure without relying on colour", () => {
    mountInPage(
      h(RepairScenarioPanel, {
        open: true,
        onClose: () => undefined,
        conflictCount: 1,
        selectedStrategy: "minimum_change",
        onSelectedStrategyChange: () => undefined,
        scenarios: [],
        onSelectScenario: () => undefined,
        onPreview: () => undefined,
        onCompare: () => undefined,
        onApply: () => undefined,
        loading: true,
        runningStrategy: "minimum_change",
        error: "Kunne ikke beregne en trygg løsning.",
        dates: ["2026-07-27"],
        sessionDuration: 30,
      }),
    );

    cy.get('[role="status"]')
      .should("have.attr", "aria-live", "polite")
      .and("contain.text", "Beregner");
    cy.get('[role="alert"]').should(
      "contain.text",
      "Kunne ikke beregne en trygg løsning.",
    );
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

  it("keeps opted-out and conflict labels consistent in list and calendar panels", () => {
    mountInPage(h(PanelMemberStatusHarness));

    ["list-panel-members", "calendar-panel-members"].forEach((projection) => {
      cy.get(`[data-cy=${projection}]`).within(() => {
        cy.get('[aria-label="Ada: Deltar ikke lenger"]').should("exist");
        cy.get('[aria-label="Linnea: Registrert inhabilitet"]').should("exist");
      });
    });
  });
});
