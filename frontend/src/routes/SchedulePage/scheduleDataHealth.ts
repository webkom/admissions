import type { AxiosError } from "axios";
import type {
  Candidate,
  InterviewAvailabilityParticipant,
  SavedSchedule,
} from "src/types";

export type ScheduleDataSource = "schedule" | "availability" | "candidates";

export type ScheduleDataHealth =
  | { kind: "ready"; failedSources: [] }
  | {
      kind: "initial_error" | "refresh_error";
      failedSources: ScheduleDataSource[];
    };

interface ScheduleDataHealthInput {
  savedSchedule: SavedSchedule | undefined;
  savedScheduleError: AxiosError | null;
  isSavedScheduleError: boolean;
  availabilityParticipants: InterviewAvailabilityParticipant[] | undefined;
  availabilityError: AxiosError | null;
  isAvailabilityError: boolean;
  interviewCandidates: Candidate[] | undefined;
  candidatesError: AxiosError | null;
  isCandidatesError: boolean;
}

const statusOf = (error: AxiosError | null) => error?.response?.status ?? 0;

export const deriveScheduleDataHealth = ({
  savedSchedule,
  savedScheduleError,
  isSavedScheduleError,
  availabilityParticipants,
  availabilityError,
  isAvailabilityError,
  interviewCandidates,
  candidatesError,
  isCandidatesError,
}: ScheduleDataHealthInput): ScheduleDataHealth => {
  const failedSources: ScheduleDataSource[] = [];

  if (isSavedScheduleError && statusOf(savedScheduleError) !== 404) {
    failedSources.push("schedule");
  }
  if (isAvailabilityError) failedSources.push("availability");
  if (isCandidatesError) failedSources.push("candidates");

  if (failedSources.length === 0) {
    return { kind: "ready", failedSources: [] };
  }

  const hasUsableSnapshot =
    (savedSchedule !== undefined || statusOf(savedScheduleError) === 404) &&
    availabilityParticipants !== undefined &&
    interviewCandidates !== undefined;

  return {
    kind: hasUsableSnapshot ? "refresh_error" : "initial_error",
    failedSources,
  };
};

export const scheduleDataSourceLabel = (source: ScheduleDataSource) =>
  source === "schedule"
    ? "planutkastet"
    : source === "availability"
      ? "tilgjengeligheten"
      : "kandidatene";
