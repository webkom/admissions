import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Search,
  ShieldCheck,
} from "lucide-react";

import {
  Chip,
  SchedulePanel,
  SchedulePanelBody,
  SchedulePanelHeader,
  actionButtonBase,
  actionButtonPrimary,
} from "src/components/Scheduling/ui";
import { iconSizes } from "src/styles/designTokens";
import type { Candidate, InterviewAvailabilityParticipant } from "src/types";
import cn from "src/utils/cn";

interface ConflictReviewViewProps {
  candidates: Candidate[] | undefined;
  currentParticipant: InterviewAvailabilityParticipant | undefined;
  onSaveReview: (
    reviewedCandidateIds: string[],
    conflictIds: string[],
  ) => Promise<void>;
}

const serializeIds = (ids: Iterable<string>) => [...ids].sort().join("\n");

const ConflictChoice: React.FC<{
  candidate: Candidate;
  selected: boolean;
  onToggle: () => void;
  compact?: boolean;
}> = ({ candidate, selected, onToggle, compact = false }) => (
  <label
    className={cn(
      "flex cursor-pointer items-center gap-3 transition-colors",
      compact ? "rounded-lg px-3 py-2.5" : "px-5 py-3.5 handheld:px-4",
      selected ? "bg-danger-bg" : "bg-surface-base hover:bg-surface-subtle",
    )}
  >
    <input
      type="checkbox"
      checked={selected}
      onChange={onToggle}
      className="h-4 w-4 flex-none rounded border-border-muted text-danger focus:ring-danger"
    />
    <span className="min-w-0 flex-1 truncate text-ui font-semibold text-text-primary">
      {candidate.name}
    </span>
    <span
      className={cn(
        "text-detail font-semibold",
        selected ? "text-danger" : "text-success",
      )}
    >
      {selected ? "Jeg er inhabil" : "Ingen konflikt"}
    </span>
  </label>
);

const ConflictReviewView: React.FC<ConflictReviewViewProps> = ({
  candidates,
  currentParticipant,
  onSaveReview,
}) => {
  const [query, setQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedConflictIds, setSelectedConflictIds] = useState<Set<string>>(
    () => new Set(currentParticipant?.conflicts ?? []),
  );
  const [lastSavedConflictState, setLastSavedConflictState] = useState(() =>
    serializeIds(currentParticipant?.conflicts ?? []),
  );
  const lastServerStateRef = useRef("");
  const serverConflictState = serializeIds(currentParticipant?.conflicts ?? []);

  useEffect(() => {
    if (serverConflictState === lastServerStateRef.current) return;
    setSelectedConflictIds(new Set(currentParticipant?.conflicts ?? []));
    setLastSavedConflictState(serverConflictState);
    lastServerStateRef.current = serverConflictState;
  }, [currentParticipant?.conflicts, serverConflictState]);

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
        .sort((a, b) => a.name.localeCompare(b.name, "nb")),
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
        .sort((a, b) => {
          const selectedDifference =
            Number(selectedConflictIds.has(b.id)) -
            Number(selectedConflictIds.has(a.id));
          return selectedDifference || a.name.localeCompare(b.name, "nb");
        })
        .slice(0, 20),
    [candidates, normalizedQuery, proposedCandidateIds, selectedConflictIds],
  );
  const reviewIsCurrent = Boolean(currentParticipant?.conflict_review_complete);
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

  const submitReview = async () => {
    if (
      isSaving ||
      candidates === undefined ||
      currentParticipant === undefined
    )
      return;
    setIsSaving(true);
    try {
      const reviewedCandidateIds = new Set(
        currentParticipant.reviewed_candidate_ids,
      );
      proposedCandidateIds.forEach((candidateId) =>
        reviewedCandidateIds.add(candidateId),
      );
      selectedConflictIds.forEach((candidateId) =>
        reviewedCandidateIds.add(candidateId),
      );
      await onSaveReview(
        [...reviewedCandidateIds].sort(),
        [...selectedConflictIds].sort(),
      );
      setLastSavedConflictState(serializeIds(selectedConflictIds));
    } finally {
      setIsSaving(false);
    }
  };

  if ((currentParticipant?.proposed_candidate_ids.length ?? 0) === 0) {
    return null;
  }

  const proposalNamesLoading =
    candidates === undefined ||
    proposedCandidates.length !==
      currentParticipant?.proposed_candidate_ids.length;
  const canSubmit =
    !proposalNamesLoading && (!reviewIsCurrent || hasConflictChanges);

  return (
    <SchedulePanel>
      <SchedulePanelHeader
        icon={ShieldCheck}
        title="Kontroller foreslåtte kandidater"
        description="Du ser bare kandidatene nå. Intervjutidene blir først synlige når planen publiseres."
        chips={
          <Chip tone={reviewIsCurrent ? "success" : "warning"}>
            {reviewIsCurrent
              ? "Kontrollert"
              : `${currentParticipant?.proposed_candidate_ids.length ?? 0} må sjekkes`}
          </Chip>
        }
      />

      <SchedulePanelBody className="border-b border-border-soft bg-surface-subtle">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="m-0 text-ui font-semibold text-text-primary">
              Marker bare unntakene.
            </p>
            <p className="m-0 mt-1 text-detail text-text-muted">
              De fleste kan bare kontrollere den korte listen og bekrefte.
              Inhabiliteter brukes til å reparere utkastet før publisering.
            </p>
          </div>
          <Chip
            tone={selectedConflictCount > 0 ? "warning" : "success"}
            icon={
              selectedConflictCount > 0 ? (
                <AlertTriangle size={12} />
              ) : (
                <Check size={12} />
              )
            }
          >
            {selectedConflictCount === 0
              ? "Ingen inhabiliteter"
              : `${selectedConflictCount} registrert`}
          </Chip>
        </div>
      </SchedulePanelBody>

      {proposalNamesLoading ? (
        <SchedulePanelBody>
          <p className="m-0 text-ui text-text-muted">
            Laster foreslåtte kandidater…
          </p>
        </SchedulePanelBody>
      ) : (
        <ul className="m-0 divide-y divide-border-faint p-0">
          {proposedCandidates.map((candidate) => (
            <li key={candidate.id}>
              <ConflictChoice
                candidate={candidate}
                selected={selectedConflictIds.has(candidate.id)}
                onToggle={() => toggleConflict(candidate.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <details className="group border-t border-border-soft">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-ui font-semibold text-text-primary hover:bg-surface-subtle handheld:px-4 [&::-webkit-details-marker]:hidden">
          <span>Har du en annen kjent inhabilitet?</span>
          <span className="flex items-center gap-1.5 text-detail text-brand">
            Legg til kandidat
            <ChevronDown
              size={iconSizes.small}
              className="transition-transform group-open:rotate-180"
            />
          </span>
        </summary>
        <div className="border-t border-border-faint bg-surface-subtle px-5 py-4 handheld:px-4">
          <label className="relative block max-w-md">
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
              className="h-10 w-full rounded-lg border border-border bg-surface-base pl-9 pr-3 text-ui text-text-primary outline-none transition-[border-color,box-shadow] focus:border-brand-input focus:ring-3 focus:ring-brand-ringSoft"
            />
          </label>
          {otherCandidates.length > 0 ? (
            <ul className="m-0 mt-3 grid gap-1 p-0 md:grid-cols-2">
              {otherCandidates.map((candidate) => (
                <li key={candidate.id}>
                  <ConflictChoice
                    candidate={candidate}
                    selected={selectedConflictIds.has(candidate.id)}
                    onToggle={() => toggleConflict(candidate.id)}
                    compact
                  />
                </li>
              ))}
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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-soft px-5 py-4 handheld:px-4">
        <p className="m-0 max-w-xl text-detail text-text-muted">
          Hvis reparasjonen gir deg en ny kandidat, trenger du bare å
          kontrollere den nye tildelingen.
        </p>
        <button
          type="button"
          disabled={!canSubmit || isSaving}
          onClick={() => void submitReview()}
          className={cn(actionButtonBase, actionButtonPrimary)}
        >
          <Check size={iconSizes.small} aria-hidden="true" />
          {isSaving
            ? "Lagrer…"
            : reviewIsCurrent && !hasConflictChanges
              ? "Kontrollert"
              : selectedConflictCount === 0
                ? "Bekreft ingen inhabiliteter"
                : "Lagre og bekreft"}
        </button>
      </div>
    </SchedulePanel>
  );
};

export default ConflictReviewView;
