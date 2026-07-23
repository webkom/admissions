import {
  candidateReviewStateFor,
  derivePublicationReadiness,
  deriveWorkflowPhase,
} from "../../frontend/src/routes/SchedulePage/workflowState";
import type { ConflictReviewSummary } from "../../frontend/src/routes/SchedulePage/types";
import type {
  InterviewAvailabilityParticipant,
  ScheduleItem,
} from "../../frontend/src/types";
import { derivePlanDraftWorkflowState } from "../../frontend/src/components/Scheduling/Solver/planDraftWorkflow";
import { buildWorkflowSteps } from "../../frontend/src/routes/SchedulePage/workflowSteps";

const schedule: ScheduleItem[] = [
  {
    candidate_id: "candidate-1",
    candidate: "Kandidat 1",
    time: 480,
    panel: [],
  },
];

const participant = (
  overrides: Partial<InterviewAvailabilityParticipant> = {},
): InterviewAvailabilityParticipant => ({
  user_id: "reviewer-1",
  username: "reviewer",
  full_name: "Ada Reviewer",
  slots: [],
  conflicts: [],
  reviewed_candidate_ids: [],
  proposed_candidate_ids: ["candidate-1"],
  conflict_review_complete: false,
  has_submitted: true,
  is_me: true,
  ...overrides,
});

const reviewSummary = (complete: boolean): ConflictReviewSummary => ({
  resolved: true,
  candidateCount: 1,
  requiredReviewerCount: 1,
  completeReviewerCount: complete ? 1 : 0,
  incompleteReviewerCount: complete ? 0 : 1,
  remainingPairCount: complete ? 0 : 1,
  isComplete: complete,
});

const readiness = ({
  draft = schedule,
  candidateIds = ["candidate-1"],
  reviewComplete = true,
  proposalConflictCount = 0,
}: {
  draft?: ScheduleItem[];
  candidateIds?: string[];
  reviewComplete?: boolean;
  proposalConflictCount?: number;
} = {}) =>
  derivePublicationReadiness({
    schedule: draft,
    candidateIds,
    candidateScopeResolved: true,
    conflictReviewSummary: reviewSummary(reviewComplete),
    proposalConflictCount,
    reviewParticipants: [
      participant({ conflict_review_complete: reviewComplete }),
    ],
  });

describe("schedule workflow state", () => {
  it("derives every workflow phase from shared publication readiness", () => {
    const setup = readiness({ draft: [] });
    const awaitingChecks = readiness({ reviewComplete: false });
    const blockedDraft = readiness({ proposalConflictCount: 1 });
    const incompleteDraft = readiness({
      candidateIds: ["candidate-1", "candidate-2"],
      reviewComplete: false,
    });
    const ready = readiness();

    expect(
      deriveWorkflowPhase({
        isDistributed: false,
        publicationReadiness: setup,
      }),
    ).to.equal("setup");
    expect(
      deriveWorkflowPhase({
        isDistributed: false,
        publicationReadiness: awaitingChecks,
      }),
    ).to.equal("awaiting-conflict-checks");
    expect(
      deriveWorkflowPhase({
        isDistributed: false,
        publicationReadiness: blockedDraft,
      }),
    ).to.equal("draft");
    expect(
      deriveWorkflowPhase({
        isDistributed: false,
        publicationReadiness: incompleteDraft,
      }),
    ).to.equal("draft");
    expect(
      deriveWorkflowPhase({
        isDistributed: false,
        publicationReadiness: ready,
      }),
    ).to.equal("ready-to-publish");
    expect(
      deriveWorkflowPhase({
        isDistributed: true,
        publicationReadiness: setup,
      }),
    ).to.equal("published");
  });

  it("keeps readiness blocked until the draft, candidates, reviews, and conflicts agree", () => {
    expect(readiness().ready).to.equal(true);
    expect(readiness({ draft: [] }).ready).to.equal(false);
    expect(
      readiness({ candidateIds: ["candidate-1", "candidate-2"] }).ready,
    ).to.equal(false);
    expect(readiness({ reviewComplete: false }).ready).to.equal(false);
    expect(readiness({ proposalConflictCount: 1 }).ready).to.equal(false);
  });

  it("requires the exact current candidate set, not only the same row count", () => {
    const staleSchedule = [
      schedule[0],
      {
        ...schedule[0],
        candidate_id: "stale-candidate",
        candidate: "Tidligere kandidat",
        time: 510,
      },
    ];

    expect(
      readiness({
        draft: staleSchedule,
        candidateIds: ["candidate-1", "candidate-2"],
      }).ready,
    ).to.equal(false);
  });

  it("uses neutral review state until a candidate is explicitly confirmed", () => {
    const unreviewed = participant();
    const confirmed = participant({
      reviewed_candidate_ids: ["candidate-1"],
      conflict_review_complete: true,
    });
    const conflict = participant({
      reviewed_candidate_ids: ["candidate-1"],
      conflicts: ["candidate-1"],
      conflict_review_complete: true,
    });

    expect(candidateReviewStateFor("candidate-1", unreviewed)).to.equal(
      "unreviewed",
    );
    expect(candidateReviewStateFor("candidate-1", confirmed)).to.equal(
      "no-conflict",
    );
    expect(candidateReviewStateFor("candidate-1", conflict)).to.equal(
      "conflict",
    );
  });
});

describe("plan draft workflow presentation", () => {
  const state = (
    overrides: Partial<Parameters<typeof derivePlanDraftWorkflowState>[0]> = {},
  ) =>
    derivePlanDraftWorkflowState({
      saveState: "saved",
      hasSaveConflict: false,
      saveError: "",
      solverError: "",
      unplaceableCount: 0,
      currentReviewRequired: false,
      currentReviewComplete: true,
      completeReviewerCount: 2,
      requiredReviewerCount: 2,
      pendingReviewerCount: 0,
      missingReviewerNames: [],
      assignmentConflictCount: 0,
      publicationReady: true,
      ...overrides,
    });

  it("waits for every review before offering repair", () => {
    expect(
      state({
        completeReviewerCount: 1,
        pendingReviewerCount: 1,
        missingReviewerNames: ["Ada"],
        assignmentConflictCount: 2,
      }),
    ).to.include({ kind: "waiting_for_reviews", tone: "neutral" });
    expect(state({ assignmentConflictCount: 2 })).to.include({
      kind: "repair_required",
      tone: "danger",
    });
    expect(
      state({
        completeReviewerCount: 0,
        requiredReviewerCount: 0,
        assignmentConflictCount: 2,
        publicationReady: false,
      }),
    ).to.include({ kind: "waiting_for_reviews", tone: "neutral" });
  });

  it("prioritizes persistence and solver errors over normal next steps", () => {
    expect(
      state({
        saveState: "error",
        saveError: "Nettverket svarte ikke.",
        currentReviewRequired: true,
        currentReviewComplete: false,
      }),
    ).to.include({ kind: "save_error" });
    expect(
      state({
        solverError: "Beregningen feilet.",
        assignmentConflictCount: 1,
      }),
    ).to.include({ kind: "solver_error" });
  });

  it("exposes no next step while saving and publishes only when ready", () => {
    expect(state({ saveState: "saving" })).to.include({ kind: "saving" });
    expect(state()).to.include({
      kind: "ready_to_publish",
      tone: "success",
    });
  });
});

describe("coarse workflow steps", () => {
  const adminSteps = (publicationReadiness = readiness()) =>
    buildWorkflowSteps({
      isAdmin: true,
      hasConfiguredAvailabilityWindows: true,
      hasDistributedPlan: false,
      myConflictReviewComplete: true,
      myProposalCandidateCount: 1,
      hasSavedConfig: true,
      hasScheduleDraft: true,
      myAvailabilitySaved: true,
      availabilityParticipantCount: 2,
      submittedAvailabilityCount: 2,
      proposalConflictCount: publicationReadiness.proposalConflictCount,
      workflowPhase: deriveWorkflowPhase({
        isDistributed: false,
        publicationReadiness,
      }),
      publicationReadiness,
    });

  it("uses only coarse labels and locks publication until readiness agrees", () => {
    const waiting = adminSteps(readiness({ reviewComplete: false }));
    expect(waiting.map((step) => step.status)).to.deep.equal([
      "Ferdig",
      "Pågår",
      "Låst",
    ]);
    expect(waiting[2].locked).to.equal(true);

    const ready = adminSteps();
    expect(ready.map((step) => step.status)).to.deep.equal([
      "Ferdig",
      "Ferdig",
      "Pågår",
    ]);
    expect(ready[2].locked).to.equal(false);
  });
});
