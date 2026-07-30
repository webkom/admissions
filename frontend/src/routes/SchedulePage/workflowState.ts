import type {
  InterviewAvailabilityParticipant,
  SavedSchedule,
  ScheduleItem,
} from "src/types";
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

const hasSameIds = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right);
  return left.every((value) => rightIds.has(value));
};

export const deriveConflictCollectionState = ({
  savedSchedule,
  candidateIds,
  participants,
}: {
  savedSchedule: SavedSchedule | undefined;
  candidateIds: string[] | undefined;
  participants: InterviewAvailabilityParticipant[] | undefined;
}) => {
  const started = Boolean(savedSchedule?.conflict_collection_revision);
  const open = Boolean(savedSchedule?.conflict_collection_open);
  const participantIds = (participants ?? [])
    .filter((participant) => participant.participation === "participating")
    .map((participant) => participant.user_id);
  const collectionParticipants = (participants ?? []).filter((participant) =>
    savedSchedule?.conflict_collection_participant_ids?.includes(
      participant.user_id,
    ),
  );
  const completedCount = collectionParticipants.filter(
    (participant) => participant.conflict_collection_complete,
  ).length;
  const participantCount =
    savedSchedule?.conflict_collection_participant_ids?.length ?? 0;
  const stale =
    started &&
    candidateIds !== undefined &&
    participants !== undefined &&
    (!hasSameIds(
      savedSchedule?.conflict_collection_candidate_ids ?? [],
      candidateIds ?? [],
    ) ||
      !hasSameIds(
        savedSchedule?.conflict_collection_participant_ids ?? [],
        participantIds,
      ));
  const complete =
    started &&
    !open &&
    !stale &&
    candidateIds !== undefined &&
    participants !== undefined &&
    participantCount > 0 &&
    completedCount === participantCount;

  return {
    started,
    open,
    stale,
    complete,
    participantCount,
    completedCount,
    needsAction: open || !complete,
  };
};

export const requiresConflictCollectionTask = ({
  savedSchedule,
  collection,
}: {
  savedSchedule: SavedSchedule | undefined;
  collection: ReturnType<typeof deriveConflictCollectionState>;
}) => {
  if (!savedSchedule?.schedule.length || savedSchedule.is_distributed) {
    return false;
  }
  return (collection.started && collection.needsAction) || !collection.complete;
};

export const derivePublicationReadiness = ({
  schedule,
  candidateIds,
  candidateScopeResolved,
  draftPersistenceReady = true,
  conflictReviewSummary,
  proposalConflictCount,
  reviewParticipants,
  conflictCollectionReady = true,
}: {
  schedule: ScheduleItem[];
  candidateIds: string[];
  candidateScopeResolved: boolean;
  draftPersistenceReady?: boolean;
  conflictReviewSummary: ConflictReviewSummary;
  proposalConflictCount: number;
  reviewParticipants: InterviewAvailabilityParticipant[];
  conflictCollectionReady?: boolean;
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
    conflictCollectionReady,
    ready:
      draftSaved &&
      draftPersistenceReady &&
      allCandidatesScheduled &&
      reviewResolved &&
      conflictCollectionReady &&
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
