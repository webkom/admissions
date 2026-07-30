import { useEffect, useMemo, useState } from "react";
import type {
  InterviewAvailabilityParticipant,
  SavedSchedule,
} from "src/types";
import type {
  ConflictReviewSummary,
  PublicationReadiness,
  TabType,
  WorkflowPhase,
  WorkflowStepDefinition,
} from "./types";
import { buildWorkflowSteps } from "./workflowSteps";
import {
  derivePublicationReadiness,
  deriveWorkflowPhase,
} from "./workflowState";
import {
  deriveFoundationStage,
  derivePublicationStage,
} from "./workflowStages";

interface ScheduleWorkflowParams {
  isAdmin: boolean;
  savedSchedule: SavedSchedule | undefined;
  participants: InterviewAvailabilityParticipant[] | undefined;
  candidateIds: string[];
  candidateScopeResolved: boolean;
  draftPersistenceReady: boolean;
  conflictCollectionNeedsAction: boolean;
  conflictCollectionReady: boolean;
}

export const useScheduleWorkflow = ({
  isAdmin,
  savedSchedule,
  participants,
  candidateIds,
  candidateScopeResolved,
  draftPersistenceReady,
  conflictCollectionNeedsAction,
  conflictCollectionReady,
}: ScheduleWorkflowParams) => {
  const initialSection: TabType = isAdmin ? "config" : "my-availability";
  const [activeSection, setActiveSection] = useState<TabType>(initialSection);
  const [visitedSections, setVisitedSections] = useState<Set<TabType>>(
    () => new Set([initialSection]),
  );

  useEffect(() => {
    if (isAdmin) return;
    setActiveSection((current) =>
      current === "config" || current === "heatmap" || current === "solver"
        ? "my-availability"
        : current,
    );
    setVisitedSections((current) => {
      const next = new Set(
        [...current].filter(
          (section) => section === "my-availability" || section === "plan",
        ),
      );
      next.add("my-availability");
      return next;
    });
  }, [isAdmin]);

  const hasSavedConfig = Boolean(
    savedSchedule &&
      (savedSchedule.end_date !== null ||
        (savedSchedule.enabled_windows?.length ?? 0) > 0 ||
        savedSchedule.enabled_slots.length > 0),
  );
  const hasConfiguredAvailabilityWindows = Boolean(
    savedSchedule &&
      ((savedSchedule.enabled_windows?.length ?? 0) > 0 ||
        savedSchedule.enabled_slots.length > 0),
  );
  const hasScheduleDraft = Boolean(savedSchedule?.schedule.length);
  const hasDistributedPlan = Boolean(savedSchedule?.is_distributed);
  const submittedAvailabilityCount =
    participants?.filter(
      (participant) =>
        participant.participation !== "not_participating" &&
        participant.has_submitted,
    ).length ?? 0;
  const availabilityParticipantCount =
    participants?.filter(
      (participant) => participant.participation !== "not_participating",
    ).length ?? 0;
  const myParticipant = participants?.find((participant) => participant.is_me);
  const myAvailabilitySaved = Boolean(
    myParticipant?.has_submitted ||
      myParticipant?.participation === "not_participating",
  );
  const reviewParticipants = useMemo(
    () =>
      (participants ?? []).filter(
        (participant) => participant.proposed_candidate_ids.length > 0,
      ),
    [participants],
  );
  const conflictReviewSummary = useMemo<ConflictReviewSummary>(() => {
    const completeReviewerCount = reviewParticipants.filter(
      (participant) => participant.conflict_review_complete,
    ).length;
    const remainingPairCount = reviewParticipants.reduce(
      (total, participant) => {
        const reviewed = new Set(participant.reviewed_candidate_ids);
        return (
          total +
          participant.proposed_candidate_ids.filter(
            (candidateId) => !reviewed.has(candidateId),
          ).length
        );
      },
      0,
    );
    const proposedCandidateIds = new Set(
      reviewParticipants.flatMap(
        (participant) => participant.proposed_candidate_ids,
      ),
    );
    const requiredReviewerCount = reviewParticipants.length;
    return {
      resolved: participants !== undefined,
      candidateCount: proposedCandidateIds.size,
      requiredReviewerCount,
      completeReviewerCount,
      incompleteReviewerCount: requiredReviewerCount - completeReviewerCount,
      remainingPairCount,
      isComplete:
        participants !== undefined &&
        requiredReviewerCount > 0 &&
        completeReviewerCount === requiredReviewerCount,
    };
  }, [participants, reviewParticipants]);
  const currentParticipant = participants?.find(
    (participant) => participant.is_me,
  );
  const conflictCollectionOpen = Boolean(
    savedSchedule?.conflict_collection_open,
  );
  const myConflictCandidateCount = conflictCollectionOpen
    ? (currentParticipant?.conflict_collection_candidate_ids?.length ?? 0)
    : (currentParticipant?.proposed_candidate_ids.length ?? 0);
  const myConflictReviewComplete = Boolean(
    conflictCollectionOpen
      ? currentParticipant?.conflict_collection_complete
      : currentParticipant?.conflict_review_complete,
  );
  const availabilityReady =
    availabilityParticipantCount > 0 &&
    submittedAvailabilityCount >= availabilityParticipantCount;
  const proposalConflictCount = useMemo(() => {
    const conflictsByInterviewer = new Map(
      (participants ?? []).map((participant) => [
        participant.user_id,
        new Set(participant.conflicts),
      ]),
    );
    return (savedSchedule?.schedule ?? []).filter((assignment) => {
      if (!assignment.candidate_id) return false;
      return assignment.panel.some(
        (member) =>
          member.id &&
          conflictsByInterviewer
            .get(member.id)
            ?.has(assignment.candidate_id ?? ""),
      );
    }).length;
  }, [participants, savedSchedule?.schedule]);
  const publicationReadiness = useMemo<PublicationReadiness>(
    () =>
      derivePublicationReadiness({
        schedule: savedSchedule?.schedule ?? [],
        candidateIds,
        candidateScopeResolved,
        draftPersistenceReady,
        conflictReviewSummary,
        proposalConflictCount,
        reviewParticipants,
        conflictCollectionReady,
      }),
    [
      candidateIds,
      candidateScopeResolved,
      conflictCollectionReady,
      conflictReviewSummary,
      draftPersistenceReady,
      proposalConflictCount,
      reviewParticipants,
      savedSchedule?.schedule,
    ],
  );
  const workflowPhase = useMemo<WorkflowPhase>(
    () =>
      deriveWorkflowPhase({
        isDistributed: hasDistributedPlan,
        publicationReadiness,
      }),
    [hasDistributedPlan, publicationReadiness],
  );
  const foundationStage = useMemo(
    () =>
      deriveFoundationStage({
        hasConfiguredAvailabilityWindows,
        ownAvailabilityComplete: myAvailabilitySaved,
        availabilityReady,
        submittedCount: submittedAvailabilityCount,
        participantCount: availabilityParticipantCount,
      }),
    [
      availabilityParticipantCount,
      availabilityReady,
      hasConfiguredAvailabilityWindows,
      myAvailabilitySaved,
      submittedAvailabilityCount,
    ],
  );
  const publicationStage = useMemo(
    () =>
      derivePublicationStage({
        isPublished: hasDistributedPlan,
        readiness: publicationReadiness,
        currentReviewRequired: myConflictCandidateCount > 0,
        currentReviewComplete: myConflictReviewComplete,
      }),
    [
      hasDistributedPlan,
      myConflictCandidateCount,
      myConflictReviewComplete,
      publicationReadiness,
    ],
  );

  const steps = useMemo<WorkflowStepDefinition[]>(
    () =>
      buildWorkflowSteps({
        isAdmin,
        hasConfiguredAvailabilityWindows,
        hasDistributedPlan,
        myConflictReviewComplete,
        myConflictCandidateCount,
        hasSavedConfig,
        hasScheduleDraft,
        myAvailabilitySaved,
        availabilityParticipantCount,
        submittedAvailabilityCount,
        proposalConflictCount,
        conflictCollectionOpen: conflictCollectionNeedsAction,
        workflowPhase,
        publicationReadiness,
      }),
    [
      availabilityParticipantCount,
      conflictCollectionNeedsAction,
      hasConfiguredAvailabilityWindows,
      hasDistributedPlan,
      hasSavedConfig,
      hasScheduleDraft,
      isAdmin,
      myConflictCandidateCount,
      myConflictReviewComplete,
      myAvailabilitySaved,
      proposalConflictCount,
      publicationReadiness,
      submittedAvailabilityCount,
      workflowPhase,
    ],
  );

  const changeSection = (key: TabType) => {
    setVisitedSections((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
    setActiveSection(key);
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  return {
    activeSection,
    visitedSections,
    steps,
    changeSection,
    hasConfiguredAvailabilityWindows,
    hasScheduleDraft,
    conflictReviewSummary,
    currentParticipant,
    currentReviewRequired:
      (currentParticipant?.proposed_candidate_ids.length ?? 0) > 0,
    currentReviewComplete: myConflictReviewComplete,
    publicationReadiness,
    foundationStage,
    publicationStage,
    workflowPhase,
    availabilityReady,
    myAvailabilitySaved,
    proposalConflictCount,
  };
};
