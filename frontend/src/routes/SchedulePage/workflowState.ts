import type { InterviewAvailabilityParticipant, ScheduleItem } from "src/types";
import type {
  CandidateReviewState,
  ConflictReviewSummary,
  PublicationReadiness,
  WorkflowPhase,
} from "./types";

export const candidateReviewStateFor = (
  candidateId: string,
  participant: InterviewAvailabilityParticipant | undefined,
): CandidateReviewState => {
  if (!participant?.reviewed_candidate_ids.includes(candidateId)) {
    return "unreviewed";
  }
  return participant.conflicts.includes(candidateId)
    ? "conflict"
    : "no-conflict";
};

export const derivePublicationReadiness = ({
  schedule,
  candidateIds,
  candidateScopeResolved,
  draftPersistenceReady = true,
  conflictReviewSummary,
  proposalConflictCount,
  reviewParticipants,
}: {
  schedule: ScheduleItem[];
  candidateIds: string[];
  candidateScopeResolved: boolean;
  draftPersistenceReady?: boolean;
  conflictReviewSummary: ConflictReviewSummary;
  proposalConflictCount: number;
  reviewParticipants: InterviewAvailabilityParticipant[];
}): PublicationReadiness => {
  const activeCandidateIds = new Set(candidateIds);
  const scheduledCandidateIds = new Set(
    schedule.flatMap((item) => (item.candidate_id ? [item.candidate_id] : [])),
  );
  const candidateCount = activeCandidateIds.size;
  const scheduledCandidateCount = [...scheduledCandidateIds].filter(
    (candidateId) => activeCandidateIds.has(candidateId),
  ).length;
  const draftSaved = schedule.length > 0;
  const allCandidatesScheduled =
    candidateScopeResolved &&
    candidateCount > 0 &&
    scheduledCandidateIds.size === candidateCount &&
    [...activeCandidateIds].every((candidateId) =>
      scheduledCandidateIds.has(candidateId),
    );
  // Same fallback rule the server uses in _missing_reviewer_names
  // (schedule_workflow.py): a reviewer with no full name should never render
  // as an empty string in the publish gate or the published-plan banner, so
  // fall back to the username before sorting. The sort key still uses the
  // display name, matching the server's "(get_full_name() or username).lower()".
  const missingReviewerNames = reviewParticipants
    .filter((participant) => !participant.conflict_review_complete)
    .map((participant) => participant.full_name || participant.username)
    .sort((left, right) => left.localeCompare(right, "nb"));
  const reviewResolved =
    conflictReviewSummary.resolved && conflictReviewSummary.isComplete;

  return {
    draftSaved,
    draftPersistenceReady,
    candidateScopeResolved,
    scheduledCandidateCount,
    candidateCount,
    allCandidatesScheduled,
    reviewResolved,
    requiredReviewerCount: conflictReviewSummary.requiredReviewerCount,
    completeReviewerCount: conflictReviewSummary.completeReviewerCount,
    incompleteReviewerCount: conflictReviewSummary.incompleteReviewerCount,
    missingReviewerNames,
    proposalConflictCount,
    ready:
      draftSaved &&
      draftPersistenceReady &&
      allCandidatesScheduled &&
      reviewResolved &&
      proposalConflictCount === 0,
  };
};

export const deriveWorkflowPhase = ({
  isDistributed,
  publicationReadiness,
}: {
  isDistributed: boolean;
  publicationReadiness: PublicationReadiness;
}): WorkflowPhase => {
  if (isDistributed) return "published";
  if (!publicationReadiness.draftSaved) return "setup";
  if (
    !publicationReadiness.allCandidatesScheduled ||
    publicationReadiness.proposalConflictCount > 0
  ) {
    return "draft";
  }
  if (!publicationReadiness.reviewResolved) {
    return "awaiting-conflict-checks";
  }
  if (publicationReadiness.ready) return "ready-to-publish";
  return "draft";
};
