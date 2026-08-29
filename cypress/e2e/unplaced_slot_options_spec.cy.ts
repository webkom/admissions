import { buildUnplacedSlotOptions } from "../../frontend/src/components/Scheduling/Solver/UnplacedSlotPicker";
import type { Interviewer } from "../../frontend/src/types";

const interviewer = (
  id: string,
  availability: number[],
  biased: string[] = [],
): Interviewer => ({
  id,
  name: id,
  availability,
  biased,
  has_submitted: true,
});

describe("buildUnplacedSlotOptions", () => {
  it("marks a slot 'available' when enough non-biased interviewers list it", () => {
    const interviewers = [
      interviewer("i1", [60, 90]),
      interviewer("i2", [60, 90]),
    ];
    const options = buildUnplacedSlotOptions({
      enabledTimeOptions: [60, 90],
      occupiedTimes: new Set(),
      candidateId: "c1",
      candidateName: "Kandidat",
      panelSize: 2,
      interviewers,
      candidates: [{ id: "c1", name: "Kandidat" }],
    });
    expect(options).to.have.length(2);
    expect(options[0].status).to.equal("available");
    expect(options[1].status).to.equal("available");
  });

  it("marks a slot 'overtime' when only non-biased, non-available interviewers can fill the panel", () => {
    const interviewers = [interviewer("i1", [60]), interviewer("i2", [])];
    const options = buildUnplacedSlotOptions({
      enabledTimeOptions: [60],
      occupiedTimes: new Set(),
      candidateId: "c1",
      candidateName: "Kandidat",
      panelSize: 2,
      interviewers,
      candidates: [{ id: "c1", name: "Kandidat" }],
    });
    expect(options[0].status).to.equal("overtime");
    expect(options[0].availableInterviewerNames).to.deep.equal(["i1"]);
    expect(options[0].overtimeInterviewerNames).to.deep.equal(["i2"]);
  });

  it("marks a slot 'unavailable' when fewer than panelSize interviewers are eligible", () => {
    const interviewers = [interviewer("i1", [60])];
    const options = buildUnplacedSlotOptions({
      enabledTimeOptions: [60],
      occupiedTimes: new Set(),
      candidateId: "c1",
      candidateName: "Kandidat",
      panelSize: 2,
      interviewers,
      candidates: [{ id: "c1", name: "Kandidat" }],
    });
    expect(options[0].status).to.equal("unavailable");
  });

  it("excludes interviewers listed in the candidate's bias list", () => {
    const interviewers = [interviewer("i1", [60]), interviewer("i2", [60])];
    const options = buildUnplacedSlotOptions({
      enabledTimeOptions: [60],
      occupiedTimes: new Set(),
      candidateId: "c1",
      candidateName: "Kandidat",
      panelSize: 2,
      interviewers,
      candidates: [{ id: "c1", name: "Kandidat" }],
    });
    // 2 available -> available
    expect(options[0].status).to.equal("available");

    const biased = buildUnplacedSlotOptions({
      enabledTimeOptions: [60],
      occupiedTimes: new Set(),
      candidateId: "c1",
      candidateName: "Kandidat",
      panelSize: 2,
      interviewers: [interviewer("i1", [60], ["c1"]), interviewer("i2", [60])],
      candidates: [{ id: "c1", name: "Kandidat" }],
    });
    // only i2 is eligible for c1 -> 1 available + 0 overtime < 2 -> unavailable
    expect(biased[0].status).to.equal("unavailable");
  });

  it("excludes the candidate themselves when they have a linked user_id", () => {
    const interviewers = [
      interviewer("i1", [60]),
      interviewer("candidate-user", [60]),
    ];
    const options = buildUnplacedSlotOptions({
      enabledTimeOptions: [60],
      occupiedTimes: new Set(),
      candidateId: "c1",
      candidateName: "Kandidat",
      panelSize: 2,
      interviewers,
      candidates: [{ id: "c1", name: "Kandidat", user_id: "candidate-user" }],
    });
    // Only i1 is non-biased and non-self -> not enough -> unavailable
    expect(options[0].status).to.equal("unavailable");
  });

  it("skips times that are already occupied", () => {
    const options = buildUnplacedSlotOptions({
      enabledTimeOptions: [60, 90],
      occupiedTimes: new Set([60]),
      candidateId: "c1",
      candidateName: "Kandidat",
      panelSize: 1,
      interviewers: [interviewer("i1", [60, 90])],
      candidates: [{ id: "c1", name: "Kandidat" }],
    });
    expect(options.map((o) => o.time)).to.deep.equal([90]);
  });
});
