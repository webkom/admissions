import type { AxiosError } from "axios";
import { deriveScheduleDataHealth } from "../../frontend/src/routes/SchedulePage/scheduleDataHealth";

const requestError = (status: number) =>
  ({ response: { status } }) as unknown as AxiosError;

const healthyData = {
  savedSchedule: undefined,
  savedScheduleError: requestError(404),
  isSavedScheduleError: true,
  availabilityParticipants: [],
  availabilityError: null,
  isAvailabilityError: false,
  interviewCandidates: [],
  candidatesError: null,
  isCandidatesError: false,
};

describe("schedule data health", () => {
  it("keeps the current workspace usable when a background refresh fails", () => {
    expect(
      deriveScheduleDataHealth({
        ...healthyData,
        availabilityError: requestError(500),
        isAvailabilityError: true,
      }),
    ).to.deep.equal({
      kind: "refresh_error",
      failedSources: ["availability"],
    });
  });

  it("blocks only when a failed source has no usable data yet", () => {
    expect(
      deriveScheduleDataHealth({
        ...healthyData,
        availabilityParticipants: undefined,
        availabilityError: requestError(500),
        isAvailabilityError: true,
      }),
    ).to.deep.equal({
      kind: "initial_error",
      failedSources: ["availability"],
    });
  });
});
