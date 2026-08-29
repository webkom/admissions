import {
  candidateReviewStateFor,
  derivePublicationReadiness,
  deriveWorkflowPhase,
} from "../../frontend/src/routes/SchedulePage/workflowState";
import type { ConflictReviewSummary } from "../../frontend/src/routes/SchedulePage/types";
import type {
  InterviewAvailabilityParticipant,
  Interviewer,
  ScheduleItem,
} from "../../frontend/src/types";
import { buildProposalDiff } from "../../frontend/src/components/Scheduling/Solver/proposalDiff";
import { derivePlanDraftWorkflowState } from "../../frontend/src/components/Scheduling/Solver/planDraftWorkflow";
import { buildWorkflowSteps } from "../../frontend/src/routes/SchedulePage/workflowSteps";
import {
  deriveFoundationStage,
  derivePendingProposalDecision,
  derivePublicationStage,
} from "../../frontend/src/routes/SchedulePage/workflowStages";

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
  draftPersistenceReady = true,
}: {
  draft?: ScheduleItem[];
  candidateIds?: string[];
  reviewComplete?: boolean;
  proposalConflictCount?: number;
  draftPersistenceReady?: boolean;
} = {}) =>
  derivePublicationReadiness({
    schedule: draft,
    candidateIds,
    candidateScopeResolved: true,
    draftPersistenceReady,
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
    expect(readiness({ draftPersistenceReady: false }).ready).to.equal(false);
    expect(readiness({ draftPersistenceReady: false }).draftSaved).to.equal(
      true,
    );
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

describe("single-stage conveyor model", () => {
  it("advances foundation through framework, availability, waiting, and readiness", () => {
    const input = {
      hasConfiguredAvailabilityWindows: false,
      ownAvailabilityComplete: false,
      availabilityReady: false,
      submittedCount: 0,
      participantCount: 2,
    };

    expect(deriveFoundationStage(input)).to.include({ kind: "framework" });
    expect(
      deriveFoundationStage({
        ...input,
        hasConfiguredAvailabilityWindows: true,
      }),
    ).to.include({ kind: "availability" });
    expect(
      deriveFoundationStage({
        ...input,
        hasConfiguredAvailabilityWindows: true,
        ownAvailabilityComplete: true,
        submittedCount: 1,
      }),
    ).to.include({ kind: "coverage_waiting" });
    expect(
      deriveFoundationStage({
        ...input,
        hasConfiguredAvailabilityWindows: true,
        ownAvailabilityComplete: true,
        availabilityReady: true,
        submittedCount: 2,
      }),
    ).to.include({ kind: "coverage_ready" });
  });

  it("gives a pending proposal precedence over every draft workspace", () => {
    const state = derivePlanDraftWorkflowState({
      saveState: "saved",
      hasSaveConflict: false,
      saveError: "",
      solverError: "",
      hasPendingProposal: true,
      loading: true,
      unplaceableCount: 2,
      currentReviewRequired: true,
      currentReviewComplete: false,
      completeReviewerCount: 0,
      requiredReviewerCount: 1,
      pendingReviewerCount: 1,
      missingReviewerNames: [],
      assignmentConflictCount: 0,
      publicationReady: false,
    });

    expect(state).to.include({ kind: "pending_proposal" });
  });

  it("replaces adoption with regeneration for stale or expired proposals", () => {
    expect(
      derivePendingProposalDecision({ isStale: false, hasExpired: false }),
    ).to.include({
      canApply: true,
      primaryAction: "apply",
      primaryLabel: "Bruk forslaget",
      showAdjustAction: true,
    });
    [true, false].forEach((isStale) => {
      const decision = derivePendingProposalDecision({
        isStale,
        hasExpired: !isStale,
      });
      expect(decision).to.include({
        canApply: false,
        primaryAction: "discard_and_regenerate",
        primaryLabel: "Forkast og lag nytt",
        showAdjustAction: false,
      });
    });
  });

  it("keeps plan-draft states exclusive, including the inline missing-placements state", () => {
    const state = (
      overrides: Partial<
        Parameters<typeof derivePlanDraftWorkflowState>[0]
      > = {},
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

    expect(
      state({
        currentReviewRequired: true,
        currentReviewComplete: false,
      }),
    ).to.include({ kind: "candidate_check_pending" });
    expect(state({ loading: true })).to.include({ kind: "generating" });
    // Missing placements is an inline status, not a separate screen: it has
    // no dismissal flag and reports the filled-day count when present.
    expect(state({ unplaceableCount: 2 })).to.include({
      kind: "placements_missing",
    });
    expect(
      state({
        unplaceableCount: 2,
        filledDayCount: 1,
        extendDayAvailable: true,
      }).description,
    ).to.include("1 hel dag er planlagt");
    expect(
      state({ unplaceableCount: 2, extendDayAvailable: false }).description,
    ).to.include("Plasser de siste manuelt");
    expect(state({ assignmentConflictCount: 1 })).to.include({
      kind: "repair_required",
    });
    expect(state()).to.include({ kind: "ready_to_publish" });
  });

  it("derives blocked, publishable, and published publication stages", () => {
    expect(
      derivePublicationStage({
        isPublished: false,
        readiness: readiness({ reviewComplete: false }),
        currentReviewRequired: true,
        currentReviewComplete: false,
      }),
    ).to.include({
      kind: "blocked_review",
      primaryAction: "review_own_check",
    });
    expect(
      derivePublicationStage({
        isPublished: false,
        readiness: readiness(),
      }),
    ).to.include({ kind: "publish", primaryAction: "publish" });
    expect(
      derivePublicationStage({
        isPublished: true,
        readiness: readiness(),
      }),
    ).to.include({
      kind: "published",
      primaryAction: "open_published_plan",
    });

    expect(
      derivePublicationStage({
        isPublished: false,
        readiness: readiness({ reviewComplete: false }),
        currentReviewRequired: true,
        currentReviewComplete: true,
      }),
    ).to.include({ kind: "waiting_for_reviews", primaryAction: null });

    expect(
      derivePublicationStage({
        isPublished: false,
        readiness: readiness({
          candidateIds: ["candidate-1", "candidate-2"],
          reviewComplete: false,
        }),
        currentReviewRequired: true,
        currentReviewComplete: true,
      }),
    ).to.include({
      kind: "blocked_review",
      primaryAction: "return_to_draft",
    });
    expect(
      derivePublicationStage({
        isPublished: false,
        readiness: readiness({
          proposalConflictCount: 1,
          reviewComplete: false,
        }),
        currentReviewRequired: true,
        currentReviewComplete: true,
      }),
    ).to.include({
      kind: "blocked_review",
      primaryAction: "return_to_draft",
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

  it("uses only coarse labels and locks the plan step until the foundation is ready", () => {
    const waiting = adminSteps(readiness({ reviewComplete: false }));
    expect(waiting.map((step) => step.status)).to.deep.equal([
      "Ferdig",
      "Pågår",
    ]);
    expect(waiting[1].title).to.equal("Plan");

    const ready = adminSteps();
    expect(ready.map((step) => step.status)).to.deep.equal([
      "Ferdig",
      "Klar til å publisere",
    ]);
    expect(ready[1].locked).to.equal(false);

    const unsavedEdit = adminSteps(readiness({ draftPersistenceReady: false }));
    expect(unsavedEdit[1]).to.include({ status: "Pågår" });

    const locked = buildWorkflowSteps({
      isAdmin: true,
      hasConfiguredAvailabilityWindows: false,
      hasDistributedPlan: false,
      myConflictReviewComplete: true,
      myProposalCandidateCount: 0,
      hasSavedConfig: true,
      hasScheduleDraft: false,
      myAvailabilitySaved: false,
      availabilityParticipantCount: 2,
      submittedAvailabilityCount: 0,
      proposalConflictCount: 0,
      workflowPhase: "setup",
      publicationReadiness: readiness({ draft: [] }),
    });
    expect(locked[1]).to.include({ status: "Låst", locked: true });
  });

  it("gives a member an actionable review step before publication", () => {
    const base = {
      isAdmin: false,
      hasConfiguredAvailabilityWindows: true,
      hasDistributedPlan: false,
      myAvailabilitySaved: true,
      availabilityParticipantCount: 2,
      submittedAvailabilityCount: 2,
      proposalConflictCount: 0,
      workflowPhase: "setup",
      publicationReadiness: readiness({ draft: [] }),
    };

    // No proposed pairings yet: the plan stays locked, as before.
    expect(
      buildWorkflowSteps({
        ...base,
        myConflictReviewComplete: false,
        myProposalCandidateCount: 0,
        hasSavedConfig: true,
        hasScheduleDraft: true,
      })[1],
    ).to.include({ status: "Låst", locked: true });

    // Proposed but unconfirmed: the member must be able to reach their
    // inhabilitetssjekk, or publication waits forever on a step they
    // cannot see.
    expect(
      buildWorkflowSteps({
        ...base,
        myConflictReviewComplete: false,
        myProposalCandidateCount: 3,
        hasSavedConfig: true,
        hasScheduleDraft: true,
      })[1],
    ).to.include({ status: "Pågår", locked: false });

    // Confirmed: back to waiting for publication.
    expect(
      buildWorkflowSteps({
        ...base,
        myConflictReviewComplete: true,
        myProposalCandidateCount: 3,
        hasSavedConfig: true,
        hasScheduleDraft: true,
      })[1],
    ).to.include({ status: "Låst", locked: true });
  });

  it("keeps Planutkast locked until the whole foundation is ready", () => {
    const steps = buildWorkflowSteps({
      isAdmin: true,
      hasConfiguredAvailabilityWindows: true,
      hasDistributedPlan: false,
      myConflictReviewComplete: false,
      myProposalCandidateCount: 0,
      hasSavedConfig: true,
      hasScheduleDraft: false,
      myAvailabilitySaved: true,
      availabilityParticipantCount: 2,
      submittedAvailabilityCount: 1,
      proposalConflictCount: 0,
      workflowPhase: "setup",
      publicationReadiness: readiness({ draft: [] }),
    });

    expect(steps[1]).to.include({ status: "Låst", locked: true });
  });

  it("sends the Plan step straight to the published plan once it is fully out", () => {
    const base = {
      isAdmin: true,
      hasConfiguredAvailabilityWindows: true,
      myConflictReviewComplete: true,
      myProposalCandidateCount: 1,
      hasSavedConfig: true,
      hasScheduleDraft: true,
      myAvailabilitySaved: true,
      availabilityParticipantCount: 2,
      submittedAvailabilityCount: 2,
      proposalConflictCount: 0,
      workflowPhase: "published" as const,
      publicationReadiness: readiness(),
    };

    // Draft in progress: the step opens the workspace.
    expect(
      buildWorkflowSteps({ ...base, hasDistributedPlan: false })[1],
    ).to.include({ navigateKey: "solver" });

    // Partially published: the workspace still plans the remaining days.
    expect(
      buildWorkflowSteps({
        ...base,
        hasDistributedPlan: true,
        planFullyDistributed: false,
      })[1],
    ).to.include({ navigateKey: "solver" });

    // Fully published: skip the redirect card, open the plan directly.
    expect(
      buildWorkflowSteps({
        ...base,
        hasDistributedPlan: true,
        planFullyDistributed: true,
      })[1],
    ).to.include({ navigateKey: "plan" });
  });
});

describe("proposal diff", () => {
  const interviewer = (id: string, name: string): Interviewer => ({
    id,
    name,
    availability: [],
    biased: [],
    has_submitted: true,
  });
  const interviewers = [
    interviewer("i1", "Ola"),
    interviewer("i2", "Kari"),
    interviewer("i3", "Per"),
  ];
  const item = (
    candidate: string,
    time: number,
    panel: Interviewer[],
  ): ScheduleItem => ({
    candidate_id: candidate,
    candidate,
    time,
    panel: panel.map(({ id, name }) => ({ id, name })),
  });

  it("counts unchanged placements instead of listing them", () => {
    const diff = buildProposalDiff({
      baseline: [item("a", 0, interviewers.slice(0, 2))],
      result: {
        status: "SUCCESS",
        schedule: [item("a", 0, interviewers.slice(0, 2))],
      },
      interviewers,
    });

    expect(diff.changes).to.have.length(0);
    expect(diff).to.include({ unchangedCount: 1, movedCount: 0 });
  });

  it("classifies moved interviews, panel swaps, gains, and losses", () => {
    const diff = buildProposalDiff({
      baseline: [
        item("moved", 0, interviewers.slice(0, 2)),
        item("swapped", 1, [interviewers[0], interviewers[1]]),
        item("lost", 2, interviewers.slice(0, 2)),
        item("kept", 3, interviewers.slice(0, 2)),
      ],
      result: {
        status: "PARTIAL",
        schedule: [
          item("moved", 5, interviewers.slice(0, 2)),
          item("swapped", 1, [interviewers[0], interviewers[2]]),
          item("gained", 4, interviewers.slice(0, 2)),
          item("kept", 3, interviewers.slice(0, 2)),
        ],
        unplaceable: [{ candidate_id: "lost", candidate: "lost" }],
      },
      interviewers,
    });

    expect(diff).to.include({
      movedCount: 1,
      panelChangedCount: 1,
      addedCount: 1,
      removedCount: 1,
      unchangedCount: 1,
    });
    const swapped = diff.changes.find(
      ({ candidate }) => candidate === "swapped",
    );
    expect(swapped?.removedInterviewers).to.deep.equal(["Kari"]);
    expect(swapped?.addedInterviewers).to.deep.equal(["Per"]);
    expect(diff.unplacedCandidates).to.include("lost");
  });

  it("pairs legacy rows without ids by name", () => {
    const legacyRow = {
      candidate: "Navn Uten Id",
      time: 0,
      panel: [{ name: "Ola" }],
    } as ScheduleItem;
    const diff = buildProposalDiff({
      baseline: [legacyRow],
      result: {
        status: "SUCCESS",
        schedule: [
          { candidate: "Navn Uten Id", time: 1, panel: [{ name: "Ola" }] },
        ] as ScheduleItem[],
      },
      interviewers,
    });

    expect(diff).to.include({ movedCount: 1, unchangedCount: 0 });
  });
});
