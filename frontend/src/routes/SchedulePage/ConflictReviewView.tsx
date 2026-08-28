import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowLeft, Check } from "lucide-react";

import {
  Chip,
  SchedulePanel,
  SchedulePanelBody,
  SchedulePanelFooter,
  SchedulePanelHeader,
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
  onCloseStage?: () => void;
}

const serializeIds = (ids: Iterable<string>) => [...ids].sort().join("\n");

const ConflictReviewView: React.FC<ConflictReviewViewProps> = ({
  candidates,
  currentParticipant,
  onSaveReview,
  openRequestKey = 0,
  reviewProgress,
  showSummary = true,
  onCloseStage,
}) => {
  // The review list is a deliberate mix: candidates proposed on your panel,
  // plausible swap partners, and fillers drawn from the student roster so the
  // list's shape says nothing about who you will actually interview. The
  // server sends filler names only on your own row (decoy_candidates), keyed
  // by the same tokens proposed_candidate_ids uses - merging them here keeps
  // every entry resolvable and renders fillers and reals identically.
  const candidateById = useMemo(
    () =>
      new Map(
        [
          ...(candidates ?? []),
          ...(currentParticipant?.decoy_candidates ?? []),
        ].map((candidate) => [candidate.id, candidate]),
      ),
    [candidates, currentParticipant?.decoy_candidates],
  );
  const reviewCandidateIds = useMemo(
    () => new Set(currentParticipant?.proposed_candidate_ids ?? []),
    [currentParticipant?.proposed_candidate_ids],
  );
  const scopedServerConflicts = useMemo(
    () =>
      (currentParticipant?.conflicts ?? []).filter((candidateId) =>
        reviewCandidateIds.has(candidateId),
      ),
    [currentParticipant?.conflicts, reviewCandidateIds],
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewFocusRequest, setReviewFocusRequest] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedConflictIds, setSelectedConflictIds] = useState<Set<string>>(
    () => new Set(scopedServerConflicts),
  );
  const lastServerStateRef = useRef("");
  const reviewSectionRef = useRef<HTMLDivElement>(null);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  // A request can navigate here and mount this component in the same render.
  // Start at zero so that first request still opens the newly mounted section.
  const lastOpenRequestRef = useRef(0);
  const serverConflictState = serializeIds(scopedServerConflicts);

  useEffect(() => {
    if (serverConflictState === lastServerStateRef.current) return;
    setSelectedConflictIds(new Set(scopedServerConflicts));
    lastServerStateRef.current = serverConflictState;
  }, [scopedServerConflicts, serverConflictState]);

  useEffect(() => {
    if (openRequestKey === lastOpenRequestRef.current) return;
    lastOpenRequestRef.current = openRequestKey;
    const ownerDocument = reviewSectionRef.current?.ownerDocument ?? document;
    const HTMLElementConstructor =
      ownerDocument.defaultView?.HTMLElement ?? HTMLElement;
    const activeElement = ownerDocument.activeElement;
    openerRef.current =
      activeElement instanceof HTMLElementConstructor ? activeElement : null;
    setReviewOpen(true);
    setReviewFocusRequest((request) => request + 1);
  }, [openRequestKey]);

  useEffect(() => {
    if (!reviewOpen) return;
    window.requestAnimationFrame(() => {
      reviewSectionRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
      reviewHeadingRef.current?.focus({ preventScroll: true });
    });
  }, [reviewFocusRequest, reviewOpen]);

  const reviewCandidates = useMemo(
    () =>
      [...reviewCandidateIds]
        .map((candidateId) => candidateById.get(candidateId))
        .filter((candidate): candidate is Candidate => Boolean(candidate))
        .sort((left, right) => left.name.localeCompare(right.name, "nb")),
    [candidateById, reviewCandidateIds],
  );
  const reviewIsCurrent = Boolean(currentParticipant?.conflict_review_complete);
  const proposalNamesLoading =
    candidates === undefined ||
    reviewCandidates.length !== reviewCandidateIds.size;
  const selectedConflictCount = selectedConflictIds.size;

  const toggleConflict = (candidateId: string) => {
    setSelectedConflictIds((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  };

  const openReview = (event: React.MouseEvent<HTMLButtonElement>) => {
    openerRef.current = event.currentTarget;
    setReviewOpen(true);
    setReviewFocusRequest((request) => request + 1);
  };

  const closeReview = useCallback(() => {
    setReviewOpen(false);
    onCloseStage?.();
    const opener = openerRef.current;
    openerRef.current = null;
    window.requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
    });
  }, [onCloseStage]);

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
      reviewCandidateIds.forEach((candidateId) =>
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
      closeReview();
    } finally {
      setIsSaving(false);
    }
  };

  if (reviewCandidateIds.size === 0 && openRequestKey === 0) {
    return null;
  }

  const progressText = reviewProgress
    ? `${reviewProgress.complete} av ${reviewProgress.total} intervjuere har bekreftet`
    : reviewIsCurrent
      ? "Du har bekreftet inhabilitetssjekken"
      : `${reviewCandidateIds.size} kandidater må kontrolleres`;

  return (
    <div
      data-cy="schedule-stage"
      data-stage="candidate-check"
      onKeyDown={(event) => {
        if (!reviewOpen || event.key !== "Escape" || event.defaultPrevented) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        closeReview();
      }}
    >
      {showSummary && !reviewOpen && (
        <SchedulePanel dataCy="conflict-review">
          <SchedulePanelBody className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="m-0 text-sm font-bold text-text-primary">
                  Inhabilitetssjekk
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
              onClick={openReview}
              data-cy="conflict-review-open"
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

      {reviewOpen && (
        <div ref={reviewSectionRef} className="scroll-mt-6">
          <SchedulePanel
            dataCy="conflict-review-inline"
            className="animate-fade-in motion-reduce:animate-none"
          >
            <SchedulePanelHeader
              title="Inhabilitetssjekk"
              description="Kryss av bare kandidater du kjenner på en måte som gjør deg inhabil. Når du bekrefter, regnes resten som uten konflikt."
              actions={
                <button
                  type="button"
                  onClick={closeReview}
                  className={cn(actionButtonBase, actionButtonNeutral)}
                >
                  <ArrowLeft size={iconSizes.small} aria-hidden="true" />
                  Tilbake til planutkast
                </button>
              }
            />
            <SchedulePanelBody>
              <h3
                ref={reviewHeadingRef}
                tabIndex={-1}
                data-cy="conflict-review-heading"
                className="sr-only"
              >
                Inhabilitetssjekk i planutkastet
              </h3>
              <div className="mb-5 rounded-lg border border-border-soft bg-surface-subtle px-4 py-3">
                <p className="m-0 text-ui font-semibold text-text-primary">
                  {progressText}
                </p>
                {reviewProgress && reviewProgress.missingNames.length > 0 && (
                  <p className="m-0 mt-1 text-detail text-text-muted">
                    Venter på {reviewProgress.missingNames.join(", ")}.
                  </p>
                )}
              </div>
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
                  </div>

                  <ul className="m-0 divide-y divide-border-faint overflow-hidden rounded-lg border border-border-soft p-0">
                    {reviewCandidates.map((candidate) => {
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
                </div>
              )}
            </SchedulePanelBody>
            <SchedulePanelFooter className="sticky bottom-0 z-10 bg-surface-base">
              <span className="sr-only" aria-live="polite">
                {isSaving ? "Lagrer inhabilitetssjekk" : ""}
              </span>
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
                disabled={proposalNamesLoading || isSaving}
                onClick={() => void submitReview()}
                data-cy="conflict-submit"
                className={cn(actionButtonBase, actionButtonPrimary)}
              >
                <Check size={iconSizes.small} aria-hidden="true" />
                {isSaving
                  ? "Lagrer…"
                  : selectedConflictCount === 0
                    ? "Bekreft ingen inhabiliteter"
                    : "Bekreft inhabilitetssjekk"}
              </button>
            </SchedulePanelFooter>
          </SchedulePanel>
        </div>
      )}
    </div>
  );
};

export default ConflictReviewView;
