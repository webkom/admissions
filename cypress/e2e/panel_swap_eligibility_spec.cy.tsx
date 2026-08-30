import {
  panelSwapBlockReason,
  toPanelSwapOption,
} from "../../frontend/src/components/Scheduling/panelSwapEligibility";
import type {
  Interviewer,
  SchedulePanelMember,
} from "../../frontend/src/types";

const interviewer = (
  over: Partial<Interviewer> & Pick<Interviewer, "id" | "name">,
): Interviewer => ({
  availability: [480, 510, 540],
  biased: [],
  has_submitted: true,
  ...over,
});

const seatHolder: SchedulePanelMember = {
  id: "seat",
  name: "Seat Holder",
  is_overtime: false,
};
const otherSeat: SchedulePanelMember = {
  id: "other",
  name: "Other Seat",
  is_overtime: false,
};

// Mirrors createAssignmentAvailabilityResolver: "not submitted" is its own
// state, distinct from "submitted but not free at this time".
const availabilityStatusAt = (time: number) => (inv: Interviewer) =>
  !inv.has_submitted
    ? ("availability_not_submitted" as const)
    : inv.availability.includes(time)
      ? ("verified" as const)
      : ("outside_submitted_availability" as const);

// One block: interviews for "cand-a" and "cand-b" sharing a two-person panel.
const ctx = {
  replacing: seatHolder,
  seatedPanel: [seatHolder, otherSeat],
  blockCandidateIds: new Set(["cand-a", "cand-b"]),
  availabilityStatusFor: availabilityStatusAt(480),
};

describe("panelSwapBlockReason", () => {
  it("never blocks the seat's own occupant", () => {
    expect(
      panelSwapBlockReason(
        interviewer({ id: "seat", name: "Seat Holder" }),
        ctx,
      ),
    ).to.equal(null);
  });

  it("blocks an interviewer already seated on the panel", () => {
    expect(
      panelSwapBlockReason(
        interviewer({ id: "other", name: "Other Seat" }),
        ctx,
      ),
    ).to.equal("on_panel");
  });

  it("blocks an interviewer inhabil against any candidate in the block", () => {
    expect(
      panelSwapBlockReason(
        interviewer({ id: "x", name: "Biased", biased: ["cand-b"] }),
        ctx,
      ),
    ).to.equal("inhabil");
  });

  it("blocks an interviewer outside their submitted availability for the slot", () => {
    expect(
      panelSwapBlockReason(
        interviewer({ id: "y", name: "Busy", availability: [600, 630] }),
        ctx,
      ),
    ).to.equal("unavailable");
  });

  it("does not block an interviewer who has not submitted availability at all", () => {
    expect(
      panelSwapBlockReason(
        interviewer({
          id: "z",
          name: "Quiet",
          has_submitted: false,
          availability: [],
        }),
        ctx,
      ),
    ).to.equal(null);
  });

  it("allows a free, unbiased, off-panel interviewer", () => {
    expect(
      panelSwapBlockReason(interviewer({ id: "ok", name: "Available" }), ctx),
    ).to.equal(null);
  });

  it("checks on-panel, then inhabilitet, then availability in that order", () => {
    const onPanelAndClashing = interviewer({
      id: "other",
      name: "Other Seat",
      biased: ["cand-a"],
      availability: [],
    });
    expect(panelSwapBlockReason(onPanelAndClashing, ctx)).to.equal("on_panel");

    const clashingAndBusy = interviewer({
      id: "p",
      name: "P",
      biased: ["cand-a"],
      availability: [],
    });
    expect(panelSwapBlockReason(clashingAndBusy, ctx)).to.equal("inhabil");
  });
});

describe("toPanelSwapOption", () => {
  it("greys out a blocked interviewer with a reason and a machine-readable kind", () => {
    expect(
      toPanelSwapOption(
        interviewer({ id: "x", name: "Biased", biased: ["cand-a"] }),
        ctx,
      ),
    ).to.deep.equal({
      id: "x",
      name: "Biased",
      disabled: true,
      disabledReason: "Inhabil i blokken",
      disabledKind: "inhabil",
    });
  });

  it("leaves an allowed interviewer selectable", () => {
    expect(
      toPanelSwapOption(interviewer({ id: "ok", name: "Available" }), ctx),
    ).to.deep.equal({
      id: "ok",
      name: "Available",
      disabled: false,
      disabledReason: undefined,
      disabledKind: undefined,
    });
  });
});
