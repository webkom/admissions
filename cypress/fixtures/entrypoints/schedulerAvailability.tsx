import React from "react";

import { makeSlotKey } from "../../../frontend/src/components/Scheduling/scheduleUtils";
import { useScheduleParticipants } from "../../../frontend/src/routes/SchedulePage/useScheduleParticipants";

export {
  AdminAvailabilityGrid,
  AdminScheduleConfig,
  SelectableScheduleGrid,
} from "./schedulerConfiguration";
export { default as AvailabilityHeatmap } from "../../../frontend/src/components/Scheduling/Calendar/AvailabilityHeatmap";
export { default as TimeScheduler } from "../../../frontend/src/components/Scheduling/Calendar/Calendar";
export {
  encodeScheduleTime,
  makeSlotKey,
} from "../../../frontend/src/components/Scheduling/scheduleUtils";

export const ScheduleParticipantsHarness: React.FC = () => {
  const { realInterviewers, solverInterviewers } = useScheduleParticipants({
    isAdmin: false,
    candidates: [],
    dates: ["2026-07-21"],
    sessionDuration: 30,
    dayStartMinute: 480,
    dayEndMinute: 540,
    chunkSize: 2,
    participants: [
      {
        user_id: "participating",
        username: "participating",
        full_name: "Deltar",
        experience_level: "experienced",
        slots: [makeSlotKey("2026-07-21", 480)],
        conflicts: [],
        reviewed_candidate_ids: [],
        proposed_candidate_ids: [],
        conflict_review_complete: true,
        has_submitted: true,
        participation: "participating",
        needs_review: false,
        affected_assignment_count: 0,
        availability_generation: 1,
        is_me: true,
      },
      {
        user_id: "not-participating",
        username: "not-participating",
        full_name: "Deltar ikke",
        experience_level: "unknown",
        slots: [],
        conflicts: [],
        reviewed_candidate_ids: [],
        proposed_candidate_ids: [],
        conflict_review_complete: true,
        has_submitted: true,
        participation: "not_participating",
        needs_review: false,
        affected_assignment_count: 0,
        availability_generation: 1,
        is_me: false,
      },
    ],
  });

  return (
    <output data-cy="schedule-participants-counts">
      {realInterviewers.length}/{solverInterviewers.length}
    </output>
  );
};
