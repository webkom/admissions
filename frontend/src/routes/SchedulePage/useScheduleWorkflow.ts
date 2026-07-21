import { useEffect, useMemo, useState } from "react";
import type {
  InterviewAvailabilityParticipant,
  SavedSchedule,
} from "src/types";
import type {
  ConflictReviewSummary,
  TabType,
  WorkflowStepDefinition,
} from "./types";
import { buildWorkflowSteps } from "./workflowSteps";

interface ScheduleWorkflowParams {
  isAdmin: boolean;
  savedSchedule: SavedSchedule | undefined;
  participants: InterviewAvailabilityParticipant[] | undefined;
}

export const useScheduleWorkflow = ({
  isAdmin,
  savedSchedule,
  participants,
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
    participants?.filter((participant) => participant.has_submitted).length ??
    0;
  const availabilityParticipantCount = participants?.length ?? 0;
  const myAvailabilitySaved = Boolean(
    participants?.find((participant) => participant.is_me)?.has_submitted,
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
  const myConflictReviewComplete = Boolean(
    currentParticipant?.conflict_review_complete,
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

  const steps = useMemo<WorkflowStepDefinition[]>(
    () =>
      buildWorkflowSteps({
        isAdmin,
        hasConfiguredAvailabilityWindows,
        hasDistributedPlan,
        conflictReviewSummary,
        myConflictReviewComplete,
        myProposalCandidateCount:
          currentParticipant?.proposed_candidate_ids.length ?? 0,
        hasSavedConfig,
        hasScheduleDraft,
        myAvailabilitySaved,
        availabilityParticipantCount,
        submittedAvailabilityCount,
        proposalConflictCount,
      }),
    [
      availabilityParticipantCount,
      conflictReviewSummary,
      hasConfiguredAvailabilityWindows,
      hasDistributedPlan,
      hasSavedConfig,
      hasScheduleDraft,
      isAdmin,
      currentParticipant?.proposed_candidate_ids.length,
      myConflictReviewComplete,
      myAvailabilitySaved,
      proposalConflictCount,
      submittedAvailabilityCount,
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return {
    activeSection,
    visitedSections,
    steps,
    changeSection,
    hasConfiguredAvailabilityWindows,
    hasScheduleDraft,
    conflictReviewSummary,
    availabilityReady,
    proposalConflictCount,
  };
};
