import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  Clock,
  Search,
  UserCheck,
  Users,
  UserX,
  X,
} from "lucide-react";
import { useFocusTrap } from "src/components/Scheduling/ConfirmDialog";
import { keyboardFocusRingClass } from "src/components/Scheduling/ui";
import { iconSizes } from "src/styles/designTokens";
import type { Candidate, InterviewAvailabilityParticipant } from "src/types";
import cn from "src/utils/cn";

interface CommitteeConflictsModalProps {
  isOpen: boolean;
  onClose: () => void;
  participants: InterviewAvailabilityParticipant[];
  candidates: Candidate[] | undefined;
}

type ViewMode = "interviewers" | "candidates";

const CommitteeConflictsModal: React.FC<CommitteeConflictsModalProps> = ({
  isOpen,
  onClose,
  participants,
  candidates = [],
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("interviewers");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyShowWithConflicts, setOnlyShowWithConflicts] = useState(false);
  const searchInputId = useId();

  useFocusTrap(dialogRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  const candidateMap = useMemo(
    () =>
      new Map(candidates.map((candidate) => [candidate.id, candidate.name])),
    [candidates],
  );

  const activeParticipants = useMemo(
    () =>
      participants.filter(
        (participant) => participant.participation !== "not_participating",
      ),
    [participants],
  );

  const interviewerConflicts = useMemo(() => {
    return activeParticipants.map((participant) => {
      const conflictIds = Array.from(
        new Set([
          ...(participant.conflicts ?? []),
          ...(participant.derived_conflicts ?? []),
        ]),
      );
      const conflictList = conflictIds
        .map((id) => ({
          id,
          name: candidateMap.get(id) || "Ukjent kandidat",
          isDerived: (participant.derived_conflicts ?? []).includes(id),
        }))
        .sort((first, second) => first.name.localeCompare(second.name, "nb"));

      return {
        participant,
        conflicts: conflictList,
        conflictCount: conflictList.length,
        isComplete: participant.conflict_review_complete,
      };
    });
  }, [activeParticipants, candidateMap]);

  const candidateConflicts = useMemo(() => {
    const map = new Map<
      string,
      {
        candidate: Candidate;
        conflictedInterviewers: { id: string; name: string }[];
        eligibleInterviewers: { id: string; name: string }[];
      }
    >();

    candidates.forEach((candidate) => {
      map.set(candidate.id, {
        candidate,
        conflictedInterviewers: [],
        eligibleInterviewers: [],
      });
    });

    activeParticipants.forEach((participant) => {
      const conflictIds = new Set([
        ...(participant.conflicts ?? []),
        ...(participant.derived_conflicts ?? []),
      ]);

      candidates.forEach((candidate) => {
        const entry = map.get(candidate.id);
        if (!entry) return;
        const interviewerInfo = {
          id: participant.user_id,
          name: participant.full_name || participant.username,
        };
        if (conflictIds.has(candidate.id)) {
          entry.conflictedInterviewers.push(interviewerInfo);
        } else {
          entry.eligibleInterviewers.push(interviewerInfo);
        }
      });
    });

    return Array.from(map.values())
      .map((entry) => ({
        ...entry,
        conflictedInterviewers: entry.conflictedInterviewers.sort(
          (first, second) => first.name.localeCompare(second.name, "nb"),
        ),
        eligibleInterviewers: entry.eligibleInterviewers.sort((first, second) =>
          first.name.localeCompare(second.name, "nb"),
        ),
      }))
      .sort((first, second) => {
        if (
          second.conflictedInterviewers.length !==
          first.conflictedInterviewers.length
        ) {
          return (
            second.conflictedInterviewers.length -
            first.conflictedInterviewers.length
          );
        }
        return first.candidate.name.localeCompare(second.candidate.name, "nb");
      });
  }, [activeParticipants, candidates]);

  const totalConflictsCount = useMemo(
    () =>
      interviewerConflicts.reduce(
        (sum, interviewer) => sum + interviewer.conflictCount,
        0,
      ),
    [interviewerConflicts],
  );

  const candidatesWithConflictCount = useMemo(
    () =>
      candidateConflicts.filter(
        (item) => item.conflictedInterviewers.length > 0,
      ).length,
    [candidateConflicts],
  );

  const completedReviewsCount = useMemo(
    () =>
      interviewerConflicts.filter((interviewer) => interviewer.isComplete)
        .length,
    [interviewerConflicts],
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredInterviewers = useMemo(() => {
    return interviewerConflicts.filter(
      ({ participant, conflicts, conflictCount }) => {
        if (onlyShowWithConflicts && conflictCount === 0) return false;
        if (!normalizedQuery) return true;

        const matchesInterviewer =
          participant.full_name.toLowerCase().includes(normalizedQuery) ||
          participant.username.toLowerCase().includes(normalizedQuery);
        const matchesCandidate = conflicts.some((conflict) =>
          conflict.name.toLowerCase().includes(normalizedQuery),
        );

        return matchesInterviewer || matchesCandidate;
      },
    );
  }, [interviewerConflicts, onlyShowWithConflicts, normalizedQuery]);

  const filteredCandidates = useMemo(() => {
    return candidateConflicts.filter(
      ({ candidate, conflictedInterviewers, eligibleInterviewers }) => {
        if (onlyShowWithConflicts && conflictedInterviewers.length === 0) {
          return false;
        }
        if (!normalizedQuery) return true;

        const matchesCandidate = candidate.name
          .toLowerCase()
          .includes(normalizedQuery);
        const matchesConflicted = conflictedInterviewers.some((interviewer) =>
          interviewer.name.toLowerCase().includes(normalizedQuery),
        );
        const matchesEligible = eligibleInterviewers.some((interviewer) =>
          interviewer.name.toLowerCase().includes(normalizedQuery),
        );

        return matchesCandidate || matchesConflicted || matchesEligible;
      },
    );
  }, [candidateConflicts, onlyShowWithConflicts, normalizedQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center overflow-y-auto bg-overlay px-4 py-6 animate-overlay-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="committee-conflicts-title"
        tabIndex={-1}
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-border-soft bg-surface-base shadow-2xl animate-scale-in motion-reduce:animate-none"
      >
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-soft px-6 py-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-muted text-brand">
                <Users size={iconSizes.compact} aria-hidden="true" />
              </span>
              <h2
                id="committee-conflicts-title"
                className="text-lg font-bold text-text-primary"
              >
                Inhabiliteter i komiteen
              </h2>
            </div>
            <p className="m-0 mt-1 text-ui text-text-muted">
              Full oversikt over meldte inhabiliteter for å forenkle bytte av
              intervjuere.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk inhabilitetsoversikt"
            className={cn(
              "rounded-lg border border-border-soft p-1.5 text-text-muted transition-colors hover:bg-surface-subtle hover:text-text-primary",
              keyboardFocusRingClass,
            )}
          >
            <X size={iconSizes.compact} aria-hidden="true" />
          </button>
        </div>

        {/* Stats summary bar */}
        <div className="grid grid-cols-1 gap-3 border-b border-border-soft bg-surface-subtle px-6 py-3.5 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border border-border-soft bg-surface-base px-3.5 py-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-muted text-brand">
              <AlertTriangle size={iconSizes.tiny} aria-hidden="true" />
            </span>
            <div>
              <span className="block text-ui font-bold text-text-primary tabular-nums">
                {totalConflictsCount}
              </span>
              <span className="block text-detail text-text-muted">
                Meldte inhabiliteter
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border-soft bg-surface-base px-3.5 py-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-muted text-brand">
              <UserX size={iconSizes.tiny} aria-hidden="true" />
            </span>
            <div>
              <span className="block text-ui font-bold text-text-primary tabular-nums">
                {candidatesWithConflictCount}
              </span>
              <span className="block text-detail text-text-muted">
                Kandidater med inhabilitet
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border-soft bg-surface-base px-3.5 py-2.5">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-md",
                completedReviewsCount === activeParticipants.length
                  ? "bg-success/15 text-success"
                  : "bg-warning-bg text-warning",
              )}
            >
              {completedReviewsCount === activeParticipants.length ? (
                <Check size={iconSizes.tiny} aria-hidden="true" />
              ) : (
                <Clock size={iconSizes.tiny} aria-hidden="true" />
              )}
            </span>
            <div>
              <span className="block text-ui font-bold text-text-primary tabular-nums">
                {completedReviewsCount} av {activeParticipants.length}
              </span>
              <span className="block text-detail text-text-muted">
                Fullførte sjekker
              </span>
            </div>
          </div>
        </div>

        {/* Toolbar: Search + View switch + Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft px-6 py-3">
          <div className="relative min-w-48 flex-1 max-w-sm">
            <Search
              size={iconSizes.tiny}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              id={searchInputId}
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Søk intervjuer eller kandidat…"
              className="w-full rounded-lg border border-border-soft bg-surface-base py-1.5 pl-8 pr-3 text-ui font-medium text-text-primary placeholder:text-text-faded focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-ringSoft"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View mode toggle */}
            <div className="inline-flex rounded-lg border border-border-soft bg-surface-subtle p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("interviewers")}
                className={cn(
                  "rounded-md px-3 py-1 text-detail font-semibold transition-colors",
                  viewMode === "interviewers"
                    ? "bg-surface-base text-text-primary shadow-xs"
                    : "text-text-muted hover:text-text-primary",
                )}
              >
                Etter intervjuer
              </button>
              <button
                type="button"
                onClick={() => setViewMode("candidates")}
                className={cn(
                  "rounded-md px-3 py-1 text-detail font-semibold transition-colors",
                  viewMode === "candidates"
                    ? "bg-surface-base text-text-primary shadow-xs"
                    : "text-text-muted hover:text-text-primary",
                )}
              >
                Etter kandidat
              </button>
            </div>

            {/* Conflict filter checkbox */}
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-detail font-semibold text-text-muted hover:text-text-primary select-none">
              <input
                type="checkbox"
                checked={onlyShowWithConflicts}
                onChange={(event) =>
                  setOnlyShowWithConflicts(event.target.checked)
                }
                className="size-3.5 rounded border-border-soft text-brand focus:ring-brand"
              />
              <span>Bare med inhabilitet</span>
            </label>
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {viewMode === "interviewers" ? (
            filteredInterviewers.length === 0 ? (
              <div className="py-12 text-center text-text-muted">
                <Users size={32} className="mx-auto mb-2 opacity-40" />
                <p className="m-0 text-ui font-medium">
                  Ingen intervjuere matcher søket.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredInterviewers.map(
                  ({ participant, conflicts, conflictCount, isComplete }) => (
                    <div
                      key={participant.user_id}
                      className={cn(
                        "rounded-xl border p-4 transition-colors",
                        conflictCount > 0
                          ? "border-border-soft bg-surface-base"
                          : "border-border-soft/60 bg-surface-subtle/50",
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-ui font-bold text-text-primary">
                            {participant.full_name || participant.username}
                          </span>
                          {participant.username && (
                            <span className="text-detail text-text-muted">
                              @{participant.username}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {isComplete ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-label font-bold text-success">
                              <Check size={10} aria-hidden="true" />
                              Fullført
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-label font-bold text-warning">
                              <Clock size={10} aria-hidden="true" />
                              Venter på svar
                            </span>
                          )}

                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-label font-bold",
                              conflictCount > 0
                                ? "border border-brand-border bg-brand-muted text-brand"
                                : "text-text-muted bg-surface-muted",
                            )}
                          >
                            {conflictCount}{" "}
                            {conflictCount === 1
                              ? "inhabilitet"
                              : "inhabiliteter"}
                          </span>
                        </div>
                      </div>

                      {conflictCount > 0 ? (
                        <div className="mt-3">
                          <span className="block text-detail font-semibold text-text-muted">
                            Inhabil for følgende kandidater:
                          </span>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {conflicts.map((conflict) => (
                              <span
                                key={conflict.id}
                                className="inline-flex items-center gap-1.5 rounded-md border border-brand-border bg-brand-tint px-2.5 py-1 text-detail font-semibold text-brand"
                              >
                                <span>{conflict.name}</span>
                                {conflict.isDerived && (
                                  <span className="text-[10px] text-brand/70">
                                    (erklæring)
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="m-0 mt-2 text-detail text-text-muted">
                          {isComplete
                            ? "Ingen inhabiliteter meldt."
                            : "Har ikke sendt inn inhabilitetssjekk ennå."}
                        </p>
                      )}
                    </div>
                  ),
                )}
              </div>
            )
          ) : filteredCandidates.length === 0 ? (
            <div className="py-12 text-center text-text-muted">
              <UserCheck size={32} className="mx-auto mb-2 opacity-40" />
              <p className="m-0 text-ui font-medium">
                Ingen kandidater matcher søket.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCandidates.map(
                ({
                  candidate,
                  conflictedInterviewers,
                  eligibleInterviewers,
                }) => {
                  const hasConflicts = conflictedInterviewers.length > 0;

                  return (
                    <div
                      key={candidate.id}
                      className={cn(
                        "rounded-xl border p-4 transition-colors",
                        hasConflicts
                          ? "border-border-soft bg-surface-base"
                          : "border-border-soft/60 bg-surface-subtle/50",
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-ui font-bold text-text-primary">
                          {candidate.name}
                        </span>

                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-label font-bold",
                              hasConflicts
                                ? "border border-brand-border bg-brand-muted text-brand"
                                : "bg-surface-muted text-text-muted",
                            )}
                          >
                            {hasConflicts
                              ? `${conflictedInterviewers.length} ${
                                  conflictedInterviewers.length === 1
                                    ? "inhabil intervjuer"
                                    : "inhabile intervjuere"
                                }`
                              : "Ingen inhabiliteter"}
                          </span>
                        </div>
                      </div>

                      {hasConflicts ? (
                        <div className="mt-3 space-y-2">
                          <div>
                            <span className="block text-detail font-semibold text-danger">
                              Inhabile intervjuere (kan ikke intervjue denne
                              kandidaten):
                            </span>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {conflictedInterviewers.map((interviewer) => (
                                <span
                                  key={interviewer.id}
                                  className="inline-flex items-center gap-1 rounded-md border border-danger-border bg-danger-bg px-2.5 py-1 text-detail font-bold text-danger"
                                >
                                  <UserX
                                    size={iconSizes.tiny}
                                    aria-hidden="true"
                                  />
                                  {interviewer.name}
                                </span>
                              ))}
                            </div>
                          </div>

                          <details className="group mt-2">
                            <summary className="cursor-pointer text-detail font-semibold text-brand hover:underline">
                              <span className="inline-flex items-center gap-1">
                                <ArrowRightLeft
                                  size={iconSizes.tiny}
                                  aria-hidden="true"
                                />
                                {eligibleInterviewers.length} habile intervjuere
                                kan overta
                              </span>
                            </summary>
                            <div className="mt-2 flex flex-wrap gap-1 rounded-lg border border-border-soft bg-surface-subtle p-2.5">
                              {eligibleInterviewers.map((interviewer) => (
                                <span
                                  key={interviewer.id}
                                  className="inline-flex items-center gap-1 rounded-md border border-border-soft bg-surface-base px-2 py-0.5 text-detail font-medium text-text-primary"
                                >
                                  <UserCheck
                                    size={iconSizes.tiny}
                                    className="text-success"
                                    aria-hidden="true"
                                  />
                                  {interviewer.name}
                                </span>
                              ))}
                            </div>
                          </details>
                        </div>
                      ) : (
                        <p className="m-0 mt-2 text-detail text-text-muted">
                          Alle {eligibleInterviewers.length} deltakende
                          intervjuere er habile for denne kandidaten.
                        </p>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border-soft px-6 py-3.5 bg-surface-subtle rounded-b-2xl">
          <span className="text-detail font-medium text-text-muted">
            {activeParticipants.length} intervjuere · {candidates.length}{" "}
            kandidater
          </span>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "rounded-lg border border-border-soft bg-surface-base px-4 py-1.5 text-ui font-semibold text-text-primary transition-colors hover:bg-surface-subtle",
              keyboardFocusRingClass,
            )}
          >
            Lukk
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommitteeConflictsModal;
