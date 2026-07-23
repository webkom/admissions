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
  conflictReviewSummary,
  proposalConflictCount,
  reviewParticipants,
}: {
  schedule: ScheduleItem[];
  candidateIds: string[];
  candidateScopeResolved: boolean;
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
  const missingReviewerNames = reviewParticipants
    .filter((participant) => !participant.conflict_review_complete)
    .map((participant) => participant.full_name)
    .sort((left, right) => left.localeCompare(right, "nb"));
  const reviewResolved =
    conflictReviewSummary.resolved && conflictReviewSummary.isComplete;

  return {
    draftSaved,
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
