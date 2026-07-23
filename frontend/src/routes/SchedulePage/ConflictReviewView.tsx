import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Search } from "lucide-react";

import ScheduleDrawer from "src/components/Scheduling/ScheduleDrawer";
import {
  Chip,
  SchedulePanel,
  SchedulePanelBody,
  actionButtonBase,
  actionButtonNeutral,
  actionButtonPrimary,
} from "src/components/Scheduling/ui";
import { iconSizes } from "src/styles/designTokens";
import type { Candidate, InterviewAvailabilityParticipant } from "src/types";
import cn from "src/utils/cn";

interface ReviewProgress {
  complete: number;
  total: number;
  missingNames: string[];
}

interface ConflictReviewViewProps {
  candidates: Candidate[] | undefined;
  currentParticipant: InterviewAvailabilityParticipant | undefined;
  onSaveReview: (
    reviewedCandidateIds: string[],
    conflictIds: string[],
  ) => Promise<void>;
  openRequestKey?: number;
  reviewProgress?: ReviewProgress;
  showSummary?: boolean;
}

const serializeIds = (ids: Iterable<string>) => [...ids].sort().join("\n");

const ConflictReviewView: React.FC<ConflictReviewViewProps> = ({
  candidates,
  currentParticipant,
  onSaveReview,
  openRequestKey = 0,
  reviewProgress,
  showSummary = true,
}) => {
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedConflictIds, setSelectedConflictIds] = useState<Set<string>>(
    () => new Set(currentParticipant?.conflicts ?? []),
  );
  const [lastSavedConflictState, setLastSavedConflictState] = useState(() =>
    serializeIds(currentParticipant?.conflicts ?? []),
  );
  const lastServerStateRef = useRef("");
  // A request can navigate here and mount this component in the same render.
  // Start at zero so that first request still opens the newly mounted drawer.
  const lastOpenRequestRef = useRef(0);
  const serverConflictState = serializeIds(currentParticipant?.conflicts ?? []);

  useEffect(() => {
    if (serverConflictState === lastServerStateRef.current) return;
    setSelectedConflictIds(new Set(currentParticipant?.conflicts ?? []));
    setLastSavedConflictState(serverConflictState);
    lastServerStateRef.current = serverConflictState;
  }, [currentParticipant?.conflicts, serverConflictState]);

  useEffect(() => {
    if (openRequestKey === lastOpenRequestRef.current) return;
    lastOpenRequestRef.current = openRequestKey;
    setDrawerOpen(true);
  }, [openRequestKey]);

  const candidateById = useMemo(
    () =>
      new Map((candidates ?? []).map((candidate) => [candidate.id, candidate])),
    [candidates],
  );
  const proposedCandidateIds = useMemo(
    () => new Set(currentParticipant?.proposed_candidate_ids ?? []),
    [currentParticipant?.proposed_candidate_ids],
  );
  const proposedCandidates = useMemo(
    () =>
      [...proposedCandidateIds]
        .map((candidateId) => candidateById.get(candidateId))
        .filter((candidate): candidate is Candidate => Boolean(candidate))
        .sort((left, right) => left.name.localeCompare(right.name, "nb")),
    [candidateById, proposedCandidateIds],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("nb");
  const otherCandidates = useMemo(
    () =>
      (candidates ?? [])
        .filter((candidate) => !proposedCandidateIds.has(candidate.id))
        .filter(
          (candidate) =>
            selectedConflictIds.has(candidate.id) ||
            (normalizedQuery.length > 0 &&
              candidate.name.toLocaleLowerCase("nb").includes(normalizedQuery)),
        )
        .sort((left, right) => {
          const selectedDifference =
            Number(selectedConflictIds.has(right.id)) -
            Number(selectedConflictIds.has(left.id));
          return (
            selectedDifference || left.name.localeCompare(right.name, "nb")
          );
        })
        .slice(0, 20),
    [candidates, normalizedQuery, proposedCandidateIds, selectedConflictIds],
  );

  const reviewIsCurrent = Boolean(currentParticipant?.conflict_review_complete);
  const proposalNamesLoading =
    candidates === undefined ||
    proposedCandidates.length !==
      (currentParticipant?.proposed_candidate_ids.length ?? 0);
  const hasConflictChanges =
    serializeIds(selectedConflictIds) !== lastSavedConflictState;
  const selectedConflictCount = selectedConflictIds.size;

  const toggleConflict = (candidateId: string) => {
    setSelectedConflictIds((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  };

  const submitReview = async (conflictIds = selectedConflictIds) => {
    if (
      isSaving ||
      candidates === undefined ||
      currentParticipant === undefined
    ) {
      return;
    }
    setIsSaving(true);
    try {
      const reviewedCandidateIds = new Set(
        currentParticipant.reviewed_candidate_ids,
      );
      proposedCandidateIds.forEach((candidateId) =>
        reviewedCandidateIds.add(candidateId),
      );
      conflictIds.forEach((candidateId) =>
        reviewedCandidateIds.add(candidateId),
      );
      await onSaveReview(
        [...reviewedCandidateIds].sort(),
        [...conflictIds].sort(),
      );
      setSelectedConflictIds(new Set(conflictIds));
      setLastSavedConflictState(serializeIds(conflictIds));
      setDrawerOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  if ((currentParticipant?.proposed_candidate_ids.length ?? 0) === 0) {
    return null;
  }

  const progressText = reviewProgress
    ? `${reviewProgress.complete} av ${reviewProgress.total} intervjuere har bekreftet`
    : reviewIsCurrent
      ? "Du har bekreftet kandidatkontrollen"
      : `${currentParticipant?.proposed_candidate_ids.length ?? 0} kandidater må kontrolleres`;

  return (
    <>
      {showSummary && (
        <SchedulePanel dataCy="conflict-review">
          <SchedulePanelBody className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="m-0 text-sm font-bold text-text-primary">
                  Kandidatkontroll
                </h2>
                <Chip tone={reviewIsCurrent ? "success" : "warning"}>
                  {reviewIsCurrent ? "Ditt svar lagret" : "Din handling"}
                </Chip>
              </div>
              <p className="m-0 mt-1 text-ui text-text-muted">{progressText}</p>
              {reviewProgress && reviewProgress.missingNames.length > 0 && (
                <p className="m-0 mt-1 text-detail text-text-subtle">
                  Venter på {reviewProgress.missingNames.join(", ")}.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className={cn(
                actionButtonBase,
                reviewIsCurrent ? actionButtonNeutral : actionButtonPrimary,
              )}
            >
              {reviewIsCurrent
                ? "Se eller endre svar"
                : "Kontroller kandidater"}
            </button>
          </SchedulePanelBody>
        </SchedulePanel>
      )}

      <ScheduleDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Kandidatkontroll"
        description="Kryss av bare kandidater du kjenner på en måte som gjør deg inhabil. Når du bekrefter, regnes resten som uten konflikt."
        dataCy="conflict-review-drawer"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span
              className={cn(
                "text-ui font-semibold",
                selectedConflictCount > 0 ? "text-danger" : "text-text-muted",
              )}
            >
              {selectedConflictCount === 0
                ? "Ingen inhabiliteter valgt"
                : `${selectedConflictCount} inhabilitet${
                    selectedConflictCount === 1 ? "" : "er"
                  } valgt`}
            </span>
            <button
              type="button"
              disabled={
                proposalNamesLoading ||
                isSaving ||
                (reviewIsCurrent && !hasConflictChanges)
              }
              onClick={() => void submitReview()}
              data-cy="conflict-submit"
              className={cn(actionButtonBase, actionButtonPrimary)}
            >
              <Check size={iconSizes.small} aria-hidden="true" />
              {isSaving
                ? "Lagrer…"
                : selectedConflictCount === 0
                  ? "Bekreft ingen inhabiliteter"
                  : "Bekreft kandidatkontroll"}
            </button>
          </div>
        }
      >
        {proposalNamesLoading ? (
          <p className="m-0 text-ui text-text-muted">
            Laster foreslåtte kandidater…
          </p>
        ) : (
          <div className="space-y-5">
            <div>
              <h3 className="m-0 text-base font-bold text-text-primary">
                Velg kandidatene du er inhabil for
              </h3>
              <p className="m-0 mt-1 text-ui text-text-muted">
                Et avkrysset navn betyr inhabil. Uavkryssede navn bekreftes som
                uten konflikt når du lagrer.
              </p>
            </div>

            <ul className="m-0 divide-y divide-border-faint overflow-hidden rounded-lg border border-border-soft p-0">
              {proposedCandidates.map((candidate) => {
                const selected = selectedConflictIds.has(candidate.id);
                return (
                  <li key={candidate.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors",
                        selected
                          ? "bg-danger-bg"
                          : "bg-surface-base hover:bg-surface-subtle",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleConflict(candidate.id)}
                        data-cy={`conflict-candidate-${candidate.id}`}
                        className="h-4 w-4 flex-none rounded border-border-muted text-danger focus:ring-danger"
                      />
                      <span className="min-w-0 flex-1 truncate text-ui font-semibold text-text-primary">
                        {candidate.name}
                      </span>
                      {selected && (
                        <span className="text-detail font-semibold text-danger">
                          Inhabil
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>

            <details className="group rounded-lg border border-border-soft">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-ui font-semibold text-text-primary hover:bg-surface-subtle [&::-webkit-details-marker]:hidden">
                <span>Har du en annen kjent inhabilitet?</span>
                <span className="flex items-center gap-1.5 text-detail text-brand">
                  Legg til kandidat
                  <ChevronDown
                    size={iconSizes.small}
                    className="transition-transform group-open:rotate-180"
                  />
                </span>
              </summary>
              <div className="border-t border-border-faint bg-surface-subtle p-4">
                <label className="relative block">
                  <Search
                    size={iconSizes.small}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
                  />
                  <span className="sr-only">Søk etter en annen kandidat</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Søk etter kandidat…"
                    className="h-10 w-full rounded-lg border border-border bg-surface-base pl-9 pr-3 text-ui text-text-primary outline-none focus:border-brand-input focus:ring-3 focus:ring-brand-ringSoft"
                  />
                </label>
                {otherCandidates.length > 0 ? (
                  <ul className="m-0 mt-3 grid gap-1 p-0">
                    {otherCandidates.map((candidate) => {
                      const selected = selectedConflictIds.has(candidate.id);
                      return (
                        <li key={candidate.id}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5",
                              selected
                                ? "bg-danger-bg"
                                : "hover:bg-surface-base",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleConflict(candidate.id)}
                              className="h-4 w-4 rounded border-border-muted text-danger focus:ring-danger"
                            />
                            <span className="min-w-0 flex-1 truncate text-ui font-semibold text-text-primary">
                              {candidate.name}
                            </span>
                            {selected && (
                              <span className="flex items-center gap-1 text-detail font-semibold text-danger">
                                <AlertTriangle size={13} aria-hidden="true" />
                                Inhabil
                              </span>
                            )}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="m-0 mt-3 text-detail text-text-muted">
                    {normalizedQuery
                      ? "Ingen andre kandidater matcher søket."
                      : "Søk bare hvis du allerede kjenner til en annen inhabilitet."}
                  </p>
                )}
              </div>
            </details>
          </div>
        )}
      </ScheduleDrawer>
    </>
  );
};

export default ConflictReviewView;
