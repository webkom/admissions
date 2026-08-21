import React, { useMemo, useState } from "react";
import { ChevronDown, LayoutPanelTop } from "lucide-react";
import { slotsToSolverAvailability } from "src/components/Scheduling/scheduleUtils";
import { keyboardFocusRingClass } from "src/components/Scheduling/ui";
import { iconSizes } from "src/styles/designTokens";
import type {
  Candidate,
  InterviewAvailabilityParticipant,
  Interviewer,
} from "src/types";
import {
  createMockCandidates,
  createMockInterviewers,
  DEFAULT_MOCK_CANDIDATE_COUNT,
  DEFAULT_MOCK_INTERVIEWER_COUNT,
} from "./mockData";

const clampMockCount = (raw: string, fallback: number) => {
  const count = Number(raw);
  return Number.isInteger(count) && count >= 1 && count <= 200
    ? count
    : fallback;
};

interface DevelopmentDataPanelProps {
  useMockData: boolean;
  onToggleMockData: (enabled: boolean) => void;
  appendMockToReal: boolean;
  onToggleAppend: (enabled: boolean) => void;
  candidateInput: string;
  onCandidateInputChange: (value: string) => void;
  interviewerInput: string;
  onInterviewerInputChange: (value: string) => void;
}

const DevelopmentDataPanel: React.FC<DevelopmentDataPanelProps> = ({
  useMockData,
  onToggleMockData,
  appendMockToReal,
  onToggleAppend,
  candidateInput,
  onCandidateInputChange,
  interviewerInput,
  onInterviewerInputChange,
}) => (
  <details className="group relative">
    <summary
      className={`flex h-9 cursor-pointer list-none items-center gap-2 rounded-full border border-border bg-surface-subtle px-3 text-detail font-semibold text-text-muted transition-colors hover:bg-surface-neutral hover:text-text-primary [&::-webkit-details-marker]:hidden ${keyboardFocusRingClass}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md text-text-faded group-hover:text-brand">
          <LayoutPanelTop size={iconSizes.compact} />
        </span>
        Testdata
      </div>
      <ChevronDown
        size={iconSizes.medium}
        className="transition-transform group-open:rotate-180"
      />
    </summary>
    <div className="absolute right-0 top-full z-40 mt-2 w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface-base px-5 py-4 shadow-xl">
      <div className="flex flex-wrap items-end gap-6">
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-text-muted">
            <input
              type="checkbox"
              checked={useMockData}
              onChange={(event) => onToggleMockData(event.target.checked)}
              className="h-4 w-4 rounded border-border-muted text-brand focus:ring-brand"
            />
            Simuler testdata
          </label>
          {useMockData && (
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-text-muted">
              <input
                type="checkbox"
                checked={appendMockToReal}
                onChange={(event) => onToggleAppend(event.target.checked)}
                className="h-4 w-4 rounded border-border-muted text-brand focus:ring-brand"
              />
              Kombiner med ekte data
            </label>
          )}
        </div>
        {useMockData && (
          <>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="mock-candidate-count"
                className="text-detail font-medium text-text-muted"
              >
                Antall kandidater
              </label>
              <input
                id="mock-candidate-count"
                type="number"
                min="1"
                max="200"
                value={candidateInput}
                onChange={(event) => onCandidateInputChange(event.target.value)}
                className="w-24 rounded-md border border-border-muted bg-surface-base px-2.5 py-2 text-sm font-bold text-text-primary transition-[border-color,box-shadow] duration-150 focus:border-brand-input focus:outline-none focus:ring-3 focus:ring-brand-ringSoft"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="mock-interviewer-count"
                className="text-detail font-medium text-text-muted"
              >
                Antall intervjuere
              </label>
              <input
                id="mock-interviewer-count"
                type="number"
                min="1"
                max="200"
                value={interviewerInput}
                onChange={(event) =>
                  onInterviewerInputChange(event.target.value)
                }
                className="w-24 rounded-md border border-border-muted bg-surface-base px-2.5 py-2 text-sm font-bold text-text-primary transition-[border-color,box-shadow] duration-150 focus:border-brand-input focus:outline-none focus:ring-3 focus:ring-brand-ringSoft"
              />
            </div>
          </>
        )}
      </div>
    </div>
  </details>
);

interface ScheduleParticipantsParams {
  isAdmin: boolean;
  candidates: Candidate[] | undefined;
  participants: InterviewAvailabilityParticipant[] | undefined;
  dates: string[];
  sessionDuration: number;
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
}

export const useScheduleParticipants = ({
  isAdmin,
  candidates: candidateData,
  participants,
  dates,
  sessionDuration,
  dayStartMinute,
  dayEndMinute,
  chunkSize,
}: ScheduleParticipantsParams) => {
  const [useMockData, setUseMockData] = useState(false);
  const [appendMockToReal, setAppendMockToReal] = useState(false);
  const [candidateInput, setCandidateInput] = useState(
    String(DEFAULT_MOCK_CANDIDATE_COUNT),
  );
  const [interviewerInput, setInterviewerInput] = useState(
    String(DEFAULT_MOCK_INTERVIEWER_COUNT),
  );
  const candidateCount = clampMockCount(
    candidateInput,
    DEFAULT_MOCK_CANDIDATE_COUNT,
  );
  const interviewerCount = clampMockCount(
    interviewerInput,
    DEFAULT_MOCK_INTERVIEWER_COUNT,
  );

  const realCandidates = useMemo<Candidate[]>(
    () => candidateData ?? [],
    [candidateData],
  );
  const realInterviewers = useMemo<Interviewer[]>(
    () =>
      (participants ?? []).map((participant) => ({
        id: participant.user_id,
        name: participant.full_name,
        gender: participant.gender,
        experience_level: participant.experience_level,
        availability: slotsToSolverAvailability(
          new Set(participant.slots),
          dates,
          sessionDuration,
        ),
        // derived_conflicts is admin-only (empty otherwise) - merged here so
        // publicationReadiness can't read "ready" while canonicalize_schedule
        // silently rejects the publish over a fadderbarn pairing nobody
        // explicitly ticked.
        biased: Array.from(
          new Set([
            ...participant.conflicts,
            ...(participant.derived_conflicts ?? []),
          ]),
        ),
        has_submitted: participant.has_submitted,
        participation: participant.participation,
        affected_assignment_count: participant.affected_assignment_count,
      })),
    [dates, participants, sessionDuration],
  );
  const participatingInterviewers = useMemo(
    () =>
      realInterviewers.filter(
        (interviewer) => interviewer.participation === "participating",
      ),
    [realInterviewers],
  );
  const mockScheduleConfig = useMemo(
    () => ({
      numDays: dates.length,
      dayStartHour: Math.floor(dayStartMinute / 60),
      dayEndHour: Math.floor(dayEndMinute / 60),
      chunkSize,
      sessionDurationMinutes: sessionDuration,
    }),
    [chunkSize, dates.length, dayEndMinute, dayStartMinute, sessionDuration],
  );

  const solverCandidates = useMemo<Candidate[]>(() => {
    if (!import.meta.env.DEV || !useMockData) return realCandidates;
    const mocks = createMockCandidates(candidateCount);
    return appendMockToReal ? [...realCandidates, ...mocks] : mocks;
  }, [appendMockToReal, candidateCount, realCandidates, useMockData]);
  const solverInterviewers = useMemo<Interviewer[]>(() => {
    if (!import.meta.env.DEV || !useMockData) return participatingInterviewers;
    const mocks = createMockInterviewers(interviewerCount, mockScheduleConfig);
    return appendMockToReal ? [...participatingInterviewers, ...mocks] : mocks;
  }, [
    appendMockToReal,
    interviewerCount,
    mockScheduleConfig,
    participatingInterviewers,
    useMockData,
  ]);

  const developmentTools =
    isAdmin && import.meta.env.DEV ? (
      <DevelopmentDataPanel
        useMockData={useMockData}
        onToggleMockData={setUseMockData}
        appendMockToReal={appendMockToReal}
        onToggleAppend={setAppendMockToReal}
        candidateInput={candidateInput}
        onCandidateInputChange={setCandidateInput}
        interviewerInput={interviewerInput}
        onInterviewerInputChange={setInterviewerInput}
      />
    ) : null;

  return {
    realCandidates,
    realInterviewers,
    solverCandidates,
    solverInterviewers,
    syntheticInput: import.meta.env.DEV && useMockData,
    developmentTools,
  };
};
