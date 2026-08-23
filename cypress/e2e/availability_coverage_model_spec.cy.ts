import { buildAvailabilityCoverage } from "../../frontend/src/components/Scheduling/Calendar/availabilityCoverage";
import {
  encodeScheduleTime,
  makeSlotKey,
} from "../../frontend/src/components/Scheduling/scheduleUtils";
import type { Candidate, Interviewer } from "../../frontend/src/types";
import { deriveSolverReadiness } from "../../frontend/src/components/Scheduling/Solver/solverSelectors";

describe("availability coverage model", () => {
  const date = "2026-07-20";
  const dates = [date];
  const chunks = [[8 * 60, 8 * 60 + 15, 8 * 60 + 30, 8 * 60 + 45]];
  const availableSlots = new Set(
    chunks[0].map((minute) => makeSlotKey(date, minute)),
  );
  const interviewer = (
    id: string,
    availableMinutes: number[],
  ): Interviewer => ({
    id,
    name: id,
    availability: availableMinutes.map((minute) =>
      encodeScheduleTime(0, minute, 15),
    ),
    biased: [],
    has_submitted: true,
  });
  const interviewers = [
    interviewer("Anna", chunks[0].slice(0, 3)),
    interviewer("Per", [chunks[0][0], chunks[0][1], chunks[0][3]]),
    interviewer("Sara", [chunks[0][0], chunks[0][2], chunks[0][3]]),
    interviewer("Emil", chunks[0].slice(1)),
  ];

  it("uses the common interviewer intersection for stable-panel blocks", () => {
    const coverage = buildAvailabilityCoverage({
      interviewers,
      availableSlots,
      dates,
      chunks,
      sessionDuration: 15,
      panelSize: 3,
      samePanelPerBlock: true,
    });

    expect(
      coverage.blocks[0].slotCoverage.map((slot) => slot.availableCount),
    ).to.deep.equal([3, 3, 3, 3]);
    expect(coverage.blocks[0].availableCount).to.equal(0);
    expect(coverage.blocks[0].status).to.equal("empty");
    expect(coverage.completeSlotCount).to.equal(4);
    expect(coverage.completeBlockCount).to.equal(0);
  });

  it("keeps global readiness distinct from a filtered inspection model", () => {
    const allCoverage = buildAvailabilityCoverage({
      interviewers,
      availableSlots,
      dates,
      chunks,
      sessionDuration: 15,
      panelSize: 3,
      samePanelPerBlock: false,
    });
    const femaleInspection = buildAvailabilityCoverage({
      interviewers: interviewers.filter((candidate) =>
        ["Anna", "Sara"].includes(candidate.id),
      ),
      availableSlots,
      dates,
      chunks,
      sessionDuration: 15,
      panelSize: 3,
      samePanelPerBlock: false,
    });

    expect(allCoverage.completeBlockCount).to.equal(1);
    expect(femaleInspection.completeBlockCount).to.equal(0);
    expect(allCoverage.openBlockCount).to.equal(
      femaleInspection.openBlockCount,
    );
  });

  it("allows a strict run to return a partial proposal when capacity is short", () => {
    const minute = chunks[0][0];
    const readiness = deriveSolverReadiness({
      candidateCount: 2,
      interviewers: [
        interviewer("Anna", [minute]),
        interviewer("Per", [minute]),
        interviewer("Sara", [minute]),
      ],
      panelSize: 3,
      enabledSlots: new Set([makeSlotKey(date, minute)]),
      dates,
      sessionDuration: 15,
      allowOvertime: false,
    });

    expect(readiness.ready).to.equal(true);
    expect(readiness.usableSlotCount).to.equal(1);
    expect(readiness.usableSlotCount).to.be.lessThan(2);
  });

  it("blocks generation when a candidate cannot form an unbiased panel", () => {
    const minute = chunks[0][0];
    const blockedCandidate: Candidate = {
      id: "blocked-candidate",
      name: "Olav Hansen",
    };
    const biasedInterviewer = (id: string): Interviewer => ({
      ...interviewer(id, [minute]),
      biased: [blockedCandidate.id],
    });
    const readiness = deriveSolverReadiness({
      candidateCount: 1,
      candidates: [blockedCandidate],
      interviewers: [biasedInterviewer("Anna"), biasedInterviewer("Per")],
      panelSize: 1,
      enabledSlots: new Set([makeSlotKey(date, minute)]),
      dates,
      sessionDuration: 15,
      allowOvertime: false,
    });

    expect(readiness.ready).to.equal(false);
    expect(readiness.conflictBlockedCandidates).to.deep.equal([
      {
        candidate: blockedCandidate,
        eligibleInterviewerCount: 0,
      },
    ]);
  });

  it("treats a candidate interviewing themselves as a hard conflict", () => {
    const minute = chunks[0][0];
    const selfCandidate: Candidate = {
      id: "self-candidate",
      name: "Ada Applicant",
      user_id: "ada",
    };
    const readiness = deriveSolverReadiness({
      candidateCount: 1,
      candidates: [selfCandidate],
      interviewers: [interviewer("ada", [minute])],
      panelSize: 1,
      enabledSlots: new Set([makeSlotKey(date, minute)]),
      dates,
      sessionDuration: 15,
      allowOvertime: false,
    });

    expect(readiness.ready).to.equal(false);
    expect(readiness.conflictBlockedCandidates[0]).to.deep.equal({
      candidate: selfCandidate,
      eligibleInterviewerCount: 0,
    });
  });

  it("blocks when conflicts remove the only experienced interviewer", () => {
    const minute = chunks[0][0];
    const candidate: Candidate = {
      id: "experience-blocked",
      name: "Emil Applicant",
    };
    const readiness = deriveSolverReadiness({
      candidateCount: 1,
      candidates: [candidate],
      interviewers: [
        {
          ...interviewer("experienced", [minute]),
          biased: [candidate.id],
          experience_level: "experienced",
        },
        {
          ...interviewer("inexperienced", [minute]),
          experience_level: "inexperienced",
        },
      ],
      panelSize: 1,
      enabledSlots: new Set([makeSlotKey(date, minute)]),
      dates,
      sessionDuration: 15,
      allowOvertime: false,
      requireExperiencedPanel: true,
    });

    expect(readiness.ready).to.equal(false);
    expect(readiness.capabilityBlockedCandidates).to.deep.equal([
      {
        candidate,
        reasons: ["experience"],
      },
    ]);
  });

  it("uses minimum per-slot coverage when panels may change", () => {
    const coverage = buildAvailabilityCoverage({
      interviewers,
      availableSlots,
      dates,
      chunks,
      sessionDuration: 15,
      panelSize: 3,
      samePanelPerBlock: false,
    });

    expect(coverage.blocks[0].availableCount).to.equal(3);
    expect(coverage.blocks[0].status).to.equal("complete");
    expect(coverage.completeSlotCount).to.equal(4);
  });

  it("keeps closed, zero, low, near-complete, and complete coverage distinct", () => {
    const minute = chunks[0][0];
    const singleSlot = new Set([makeSlotKey(date, minute)]);
    const candidates = [
      interviewer("Anna", [minute]),
      interviewer("Per", [minute]),
      interviewer("Sara", [minute]),
    ];
    const coverageFor = (
      eligibleInterviewers: Interviewer[],
      slots = singleSlot,
    ) =>
      buildAvailabilityCoverage({
        interviewers: eligibleInterviewers,
        availableSlots: slots,
        dates,
        chunks: [[minute]],
        sessionDuration: 15,
        panelSize: 3,
        samePanelPerBlock: true,
      }).blocks[0];

    expect(coverageFor([], new Set<string>()).status).to.equal("closed");
    expect(coverageFor([]).status).to.equal("empty");
    expect(coverageFor(candidates.slice(0, 1))).to.include({
      availableCount: 1,
      status: "partial",
    });
    expect(coverageFor(candidates.slice(0, 2))).to.include({
      availableCount: 2,
      status: "partial",
    });
    expect(coverageFor(candidates)).to.include({
      availableCount: 3,
      status: "complete",
    });
  });
});
