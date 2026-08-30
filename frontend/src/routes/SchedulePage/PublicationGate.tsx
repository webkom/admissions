import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck,
  Check,
  Clock3,
  Users,
} from "lucide-react";

import ConfirmDialog from "src/components/Scheduling/ConfirmDialog";
import {
  SegmentedControl,
  SchedulePanel,
  SchedulePanelBody,
  SchedulePanelFooter,
  SchedulePanelHeader,
  actionButtonBase,
  actionButtonNeutral,
  actionButtonPrimary,
  sectionLabelClass,
} from "src/components/Scheduling/ui";
import { formatAccessibleDate } from "src/components/Scheduling/scheduleUtils";
import PublishBoundaryTimeline from "./PublishBoundaryTimeline";
import { iconSizes, iconStrokeWidths } from "src/styles/designTokens";
import type { NameVisibility, SavedSchedule } from "src/types";
import cn from "src/utils/cn";
import type { PublicationReadiness } from "./types";
import type { PublicationStagePresentation } from "./workflowStages";

interface PublicationGateProps {
  savedSchedule: SavedSchedule | undefined;
  readiness: PublicationReadiness;
  /** Named pairs that violate a registered inhabilitet. Same data as
   *  readiness.proposalConflictCount, but with names so the admin can
   *  find the offending row in the plan instead of hunting. */
  proposalConflicts: Array<{
    candidate_id: string;
    candidate_name: string;
    interviewer_id: string;
    interviewer_name: string;
  }>;
  planTransition: "publishing" | "unlocking" | null;
  planTransitionError: string;
  /**
   * The structured `schedule` field from the server's 400, surfaced as the
   * authoritative reason the publish failed (e.g. "3 intervjuere må
   * kontrollere ..."). Distinct from `planTransitionError`, which is the
   * generic toast message.
   */
  scheduleFieldError?: string;
  stage: PublicationStagePresentation;
  dates: string[];
  onOpenDraft: () => void;
  onOpenOwnReview: () => void;
  onOpenConflictsOverview?: () => void;
  onPublish: (
    visibility: NameVisibility,
    deviationApprovalFingerprint?: string,
    distributedThrough?: string,
    deferUnplacedCandidates?: boolean,
    publishWithoutFullReview?: boolean,
  ) => Promise<boolean>;
  deferUnplacedIntent?: boolean;
  onConsumeDeferUnplacedIntent?: () => void;
}

interface ReadinessRowProps {
  complete: boolean;
  title: string;
  description: string;
}

const ReadinessRow = ({ complete, title, description }: ReadinessRowProps) => (
  <li className="flex flex-wrap items-start justify-between gap-3 border-b border-border-faint py-3.5 last:border-b-0">
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border",
          complete
            ? "border-success-border bg-success-bg text-success"
            : "border-amber-200 bg-amber-50 text-amber-800",
        )}
      >
        {complete ? (
          <Check
            size={iconSizes.small}
            strokeWidth={iconStrokeWidths.emphasis}
            aria-hidden="true"
          />
        ) : (
          <Clock3 size={iconSizes.detail} aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0">
        <p className="m-0 text-ui font-semibold text-text-primary">{title}</p>
        <p className="m-0 mt-1 text-detail leading-relaxed text-text-muted">
          {description}
        </p>
      </div>
    </div>
  </li>
);

const PublicationGate = ({
  savedSchedule,
  readiness,
  planTransition,
  planTransitionError,
  scheduleFieldError = "",
  stage,
  dates,
  onOpenDraft,
  onOpenOwnReview,
  onOpenConflictsOverview,
  onPublish,
  deferUnplacedIntent,
  onConsumeDeferUnplacedIntent,
}: PublicationGateProps) => {
  const [publishVisibility, setPublishVisibility] = useState<NameVisibility>(
    savedSchedule?.name_visibility ?? "hidden",
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishScope, setPublishScope] = useState<"full" | "partial">("full");
  const sortedDates = useMemo(() => [...dates].sort(), [dates]);
  const [partialThroughDate, setPartialThroughDate] = useState<string>("");
  const selectedThroughDate = sortedDates.includes(partialThroughDate)
    ? partialThroughDate
    : (sortedDates[0] ?? "");
  const deviationReview = savedSchedule?.deviation_review;
  const deviationApprovalPending = Boolean(
    deviationReview?.requires_approval && !deviationReview.approved,
  );

  useEffect(() => {
    setPublishVisibility(savedSchedule?.name_visibility ?? "hidden");
  }, [savedSchedule?.name_visibility]);

  // The waiver on the kandidatkontroll gate is per-publish, not a setting:
  // the admin re-decides for every publish. A fresh republish is
  // intentionally not sticky. If the server just refused with the
  // kandidatkontroll message, auto-tick the override for the admin so
  // confirm is one click - the gate is showing the actual blocker,
  // approval is implicit.
  const [waiveReview, setWaiveReview] = useState(false);
  const serverReviewRefusal = scheduleFieldError.includes("kontrollere");
  useEffect(() => {
    if (serverReviewRefusal) setWaiveReview(true);
  }, [serverReviewRefusal]);
  // A committee recruiter only ever sees their own review row (the other
  // interviewers' proposed candidates are admin-only), so `readiness` can
  // read "resolved" while the backend still counts unfinished reviewers.
  // Once the server has actually refused on that basis, ticking the box
  // must send `publish_without_full_review` regardless of local readiness.
  const reviewWaiveActive =
    waiveReview && (!readiness.reviewResolved || serverReviewRefusal);
  // Name the reviewers when the local readiness knows them; on a bare
  // server refusal (committee recruiter - can't see the other rows) fall
  // back to a count, then to a generic phrase.
  const waiveReviewTarget =
    readiness.missingReviewerNames.length > 0
      ? readiness.missingReviewerNames.join(", ")
      : readiness.incompleteReviewerCount > 0
        ? `${readiness.incompleteReviewerCount} intervjuere`
        : null;
  const waiveReviewButtonLabel = waiveReviewTarget
    ? `Publiser uten kontrollen til ${waiveReviewTarget}`
    : "Publiser uten kandidatkontroll";

  const unplacedCount = Math.max(
    0,
    readiness.candidateCount - readiness.scheduledCandidateCount,
  );
  const [deferUnplaced, setDeferUnplaced] = useState(false);

  useEffect(() => {
    if (deferUnplacedIntent) {
      setDeferUnplaced(true);
      onConsumeDeferUnplacedIntent?.();
    }
  }, [deferUnplacedIntent, onConsumeDeferUnplacedIntent]);
  // Strict readiness demands every candidate placed. A delplan - an
  // acknowledged partial plan under progressive publishing - may publish
  // with candidates waiting for days that open later.
  const unplacedResolved =
    readiness.allCandidatesScheduled || (unplacedCount > 0 && deferUnplaced);
  const reviewResolved = readiness.reviewResolved || waiveReview;
  const publishable =
    readiness.ready ||
    (unplacedResolved &&
      readiness.draftSaved &&
      readiness.draftPersistenceReady &&
      readiness.candidateScopeResolved &&
      reviewResolved &&
      readiness.proposalConflictCount === 0);

  const blocker = useMemo(() => {
    if (!readiness.draftSaved) return "Et lagret planutkast mangler.";
    if (!readiness.draftPersistenceReady) {
      return "De siste endringene i planutkastet er ikke ferdig lagret.";
    }
    if (!readiness.candidateScopeResolved) {
      return "Kandidatlisten er ikke ferdig lastet.";
    }
    if (!unplacedResolved) {
      return `${unplacedCount} kandidat${
        unplacedCount === 1 ? "" : "er"
      } mangler intervju. Planlegg neste dag, eller bekreft at de planlegges senere.`;
    }
    if (readiness.proposalConflictCount > 0) {
      return `${readiness.proposalConflictCount} intervju${
        readiness.proposalConflictCount === 1 ? " har" : "er har"
      } en registrert inhabilitet.`;
    }
    if (!readiness.reviewResolved) {
      return `${readiness.incompleteReviewerCount} bekreftelse${
        readiness.incompleteReviewerCount === 1 ? "" : "r"
      } gjenstår.`;
    }
    return "";
  }, [readiness, unplacedCount, unplacedResolved]);

  const confirmPublish = async () => {
    const published = await onPublish(
      publishVisibility,
      deviationReview?.requires_approval
        ? deviationReview.deviation_fingerprint
        : undefined,
      publishScope === "partial" ? selectedThroughDate : undefined,
      deferUnplaced && unplacedCount > 0,
      reviewWaiveActive,
    );
    if (published) setConfirmOpen(false);
  };

  const reviewDescription = readiness.reviewResolved
    ? `${readiness.completeReviewerCount} av ${readiness.requiredReviewerCount} intervjuere har bekreftet.`
    : `${readiness.completeReviewerCount} av ${readiness.requiredReviewerCount} har bekreftet${
        readiness.missingReviewerNames.length > 0
          ? `. Venter på ${readiness.missingReviewerNames.join(", ")}.`
          : "."
      }`;

  return (
    <>
      <div data-cy="schedule-stage" data-stage={stage.kind}>
        <SchedulePanel dataCy="publication-gate" stage={stage.kind}>
          <SchedulePanelHeader
            icon={CalendarCheck}
            title={stage.title}
            description={stage.description}
          />
          {planTransitionError && (
            <div
              role="alert"
              className="border-b border-danger-border bg-danger-bg px-5 py-3 text-ui font-semibold text-danger"
            >
              {planTransitionError}
            </div>
          )}
          {scheduleFieldError && !planTransitionError && (
            <div
              role="alert"
              data-cy="publish-schedule-field-error"
              className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-ui text-amber-950"
            >
              {scheduleFieldError}
            </div>
          )}
          {savedSchedule?.published_without_review_by &&
            savedSchedule.published_without_review_by.length > 0 && (
              <div
                data-cy="previously-bypassed-banner"
                className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-ui text-amber-950"
              >
                <strong className="block">
                  Forrige publisering ble gjort uten kontroll fra{" "}
                  {savedSchedule.published_without_review_by.join(", ")}
                </strong>
                <p className="m-0 mt-1 text-xs leading-relaxed">
                  En ny publisering uten alle svar vil bli loggført på nytt.
                </p>
              </div>
            )}
          <SchedulePanelBody className="grid gap-7 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.42fr)]">
            <section aria-labelledby="publication-checks-heading">
              <h3
                id="publication-checks-heading"
                className="m-0 text-base font-bold text-text-primary"
              >
                Publiseringskrav
              </h3>
              <ul className="m-0 mt-2 p-0">
                <ReadinessRow
                  complete={readiness.draftSaved}
                  title="Planutkast lagret"
                  description={
                    readiness.draftSaved
                      ? `${readiness.scheduledCandidateCount} intervjuer er lagret.`
                      : "Generer og lagre et planutkast før publisering."
                  }
                />
                <ReadinessRow
                  complete={readiness.draftPersistenceReady}
                  title="Siste endringer lagret"
                  description={
                    readiness.draftPersistenceReady
                      ? "Planutkastet har ingen ventende lokale endringer."
                      : "Vent til lagringen er ferdig, eller løs lagringsfeilen i planutkastet."
                  }
                />
                <ReadinessRow
                  complete={unplacedResolved}
                  title="Alle kandidater har et intervju"
                  description={
                    !readiness.candidateScopeResolved
                      ? "Venter på at kandidatlisten skal bli ferdig lastet."
                      : deferUnplaced && unplacedCount > 0
                        ? `${readiness.scheduledCandidateCount} av ${readiness.candidateCount} kandidater er plassert. De siste ${unplacedCount} planlegges senere (bekreftet).`
                        : `${readiness.scheduledCandidateCount} av ${readiness.candidateCount} kandidater er plassert.`
                  }
                />
                <ReadinessRow
                  complete={readiness.reviewResolved}
                  title="Inhabilitetssjekk bekreftet"
                  description={reviewDescription}
                />
                <ReadinessRow
                  complete={readiness.proposalConflictCount === 0}
                  title="Ingen uløste planproblemer"
                  description={
                    readiness.proposalConflictCount === 0
                      ? "Ingen registrerte inhabiliteter finnes i tildelingene."
                      : `${readiness.proposalConflictCount} tildeling${
                          readiness.proposalConflictCount === 1 ? "" : "er"
                        } må repareres.`
                  }
                />
                <ReadinessRow
                  complete={!deviationReview?.requires_approval}
                  title="Tilgjengelighetsavvik kontrollert"
                  description={
                    deviationReview?.error
                      ? deviationReview.error
                      : deviationReview?.requires_approval
                        ? `${deviationReview.deviation_count} avvik er tydelig markert og må godkjennes i publiseringsbekreftelsen.`
                        : deviationReview?.deviation_count
                          ? `${deviationReview.deviation_count} markerte avvik følger valgt automatisk policy.`
                          : "Planen holder seg innenfor oppgitt tilgjengelighet."
                  }
                />
              </ul>
            </section>

            <div className="grid gap-4">
              <aside className="rounded-xl bg-surface-subtle p-4">
                <p className={sectionLabelClass}>
                  Kandidatnavn etter publisering
                </p>
                <SegmentedControl<NameVisibility>
                  aria-label="Synlighet for kandidatnavn ved publisering"
                  value={publishVisibility}
                  onChange={setPublishVisibility}
                  items={[
                    { key: "hidden", label: "Skjult" },
                    { key: "admin_only", label: "Ansvarlige" },
                    { key: "committee", label: "Komiteen" },
                  ]}
                />
                <p className="m-0 mt-3 text-detail leading-relaxed text-text-muted">
                  {publishVisibility === "hidden"
                    ? "Kandidatnavn forblir skjult etter publisering."
                    : publishVisibility === "admin_only"
                      ? "Bare opptaksansvarlige kan se kandidatnavnene."
                      : "Alle med tilgang til intervjuplanen kan se kandidatnavnene."}
                </p>
              </aside>

              {unplacedCount > 0 && (
                <aside className="rounded-xl bg-surface-subtle p-4">
                  <p className={sectionLabelClass}>Resterende kandidater</p>
                  <label
                    className="flex cursor-pointer items-start gap-2 text-ui text-text-primary"
                    data-cy="defer-unplaced-candidates-label"
                  >
                    <input
                      type="checkbox"
                      checked={deferUnplaced}
                      onChange={(event) =>
                        setDeferUnplaced(event.target.checked)
                      }
                      data-cy="defer-unplaced-candidates"
                      className="mt-0.5 h-4 w-4 flex-none rounded border-border-muted text-primary focus:ring-primary"
                    />
                    <span>
                      {unplacedCount} kandidat{unplacedCount === 1 ? "" : "er"}{" "}
                      venter på plassering — de planlegges når flere dager åpnes
                    </span>
                  </label>
                  <p className="m-0 mt-3 text-detail leading-relaxed text-text-muted">
                    Delplanen publiseres uten dem. Bekreftelsen gjelder denne
                    publiseringen; senere dager planlegges rundt det som alt er
                    publisert, og utkastet viser fortsatt hvem som venter.
                  </p>
                </aside>
              )}

              {(!readiness.reviewResolved &&
                readiness.incompleteReviewerCount > 0) ||
              serverReviewRefusal ? (
                <aside
                  className="rounded-xl border border-amber-200 bg-amber-50 p-4"
                  data-cy="waive-review-panel"
                >
                  <p className={sectionLabelClass}>
                    Kandidatkontroll ikke fullført
                  </p>
                  <label
                    className="flex cursor-pointer items-start gap-2 text-ui text-amber-950"
                    data-cy="waive-review-label"
                  >
                    <input
                      type="checkbox"
                      checked={waiveReview}
                      onChange={(event) => setWaiveReview(event.target.checked)}
                      data-cy="waive-review"
                      className="mt-0.5 h-4 w-4 flex-none rounded border-border-muted text-primary focus:ring-primary"
                    />
                    <span>{waiveReviewButtonLabel}</span>
                  </label>
                  <p className="m-0 mt-3 text-detail leading-relaxed text-amber-900">
                    Beslutningen loggføres på deg og vises på den publiserte
                    planen, slik at komiteen ser hvilke paringer som gikk ut
                    uten at noen sjekket for inhabilitet.
                  </p>
                </aside>
              ) : null}

              {sortedDates.length > 1 && (
                <aside className="rounded-xl bg-surface-subtle p-4">
                  <p className={sectionLabelClass}>Publiseringsomfang</p>
                  <SegmentedControl<"full" | "partial">
                    aria-label="Hvor mye av planen som skal publiseres"
                    value={publishScope}
                    onChange={setPublishScope}
                    items={[
                      { key: "full", label: "Hele planen" },
                      { key: "partial", label: "Til og med en dato" },
                    ]}
                  />
                  {publishScope === "partial" && (
                    <div className="mt-3">
                      <label
                        htmlFor="publish-through-date"
                        className="m-0 block text-detail font-semibold text-text-primary"
                      >
                        Publiser til og med
                      </label>
                      <select
                        id="publish-through-date"
                        value={selectedThroughDate}
                        onChange={(event) =>
                          setPartialThroughDate(event.target.value)
                        }
                        className="mt-1 w-full rounded-md border border-border bg-surface-base px-2 py-1.5 text-ui text-text-primary"
                      >
                        {sortedDates.map((date) => (
                          <option key={date} value={date}>
                            {formatAccessibleDate(date)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="mt-3">
                    <PublishBoundaryTimeline
                      dates={sortedDates}
                      distributedThrough={
                        savedSchedule?.is_distributed
                          ? (savedSchedule.distributed_through ?? null)
                          : null
                      }
                      previewThrough={
                        publishScope === "partial" ? selectedThroughDate : null
                      }
                      compact
                    />
                  </div>
                  <p className="m-0 mt-3 text-detail leading-relaxed text-text-muted">
                    {publishScope === "full"
                      ? "Alle intervjuer i planen blir synlige med det samme."
                      : "Intervjuer etter valgt dato holdes skjult for komiteen. Du kan utvide planen senere."}
                  </p>
                </aside>
              )}
            </div>
          </SchedulePanelBody>
          <SchedulePanelFooter className="sticky bottom-0 z-10 bg-surface-base">
            <div>
              {blocker ? (
                <p
                  data-cy="publish-blocked-reason"
                  className="m-0 flex items-center gap-2 text-ui font-semibold text-amber-800"
                >
                  <AlertTriangle size={iconSizes.small} aria-hidden="true" />
                  {blocker}
                </p>
              ) : deviationApprovalPending ? (
                <p className="m-0 flex items-center gap-2 text-ui font-semibold text-amber-800">
                  <AlertTriangle size={iconSizes.small} aria-hidden="true" />
                  Avvik fra tilgjengelighet godkjennes i neste steg.
                </p>
              ) : (
                <p className="m-0 text-ui font-semibold text-success">
                  Alle krav er oppfylt.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {onOpenConflictsOverview && (
                <button
                  type="button"
                  onClick={onOpenConflictsOverview}
                  data-cy="open-conflicts-overview"
                  className={cn(actionButtonBase, actionButtonNeutral)}
                >
                  <Users size={iconSizes.small} aria-hidden="true" />
                  Inhabiliteter
                </button>
              )}
              {publishable ? (
                <>
                  <button
                    type="button"
                    onClick={onOpenDraft}
                    className={cn(actionButtonBase, actionButtonNeutral)}
                  >
                    <ArrowLeft size={iconSizes.small} aria-hidden="true" />
                    Se planutkast
                  </button>
                  <button
                    type="button"
                    disabled={planTransition !== null}
                    onClick={() => setConfirmOpen(true)}
                    data-cy="publish-plan"
                    className={cn(actionButtonBase, actionButtonPrimary)}
                  >
                    {planTransition === "publishing"
                      ? "Publiserer…"
                      : publishScope === "partial"
                        ? `Publiser til og med ${formatAccessibleDate(selectedThroughDate)}`
                        : deferUnplaced && unplacedCount > 0
                          ? `Publiser delplan (${unplacedCount} senere)`
                          : reviewWaiveActive
                            ? waiveReviewButtonLabel
                            : "Publiser intervjuplan"}
                  </button>
                </>
              ) : stage.primaryAction ? (
                <button
                  type="button"
                  onClick={
                    stage.primaryAction === "review_own_check"
                      ? onOpenOwnReview
                      : onOpenDraft
                  }
                  data-cy="publication-primary-action"
                  className={cn(actionButtonBase, actionButtonPrimary)}
                >
                  {stage.primaryAction === "review_own_check"
                    ? "Kontroller kandidater"
                    : "Løs i planutkast"}
                </button>
              ) : stage.secondaryActions.includes("review_own_check") ? (
                <button
                  type="button"
                  onClick={onOpenOwnReview}
                  className={cn(actionButtonBase, actionButtonNeutral)}
                >
                  Se eller endre mitt svar
                </button>
              ) : null}
            </div>
          </SchedulePanelFooter>
        </SchedulePanel>
      </div>

      {confirmOpen && (
        <ConfirmDialog
          title="Publiser intervjuplan"
          confirmLabel={
            planTransition === "publishing"
              ? "Publiserer…"
              : publishScope === "partial"
                ? `Publiser til og med ${formatAccessibleDate(selectedThroughDate)}`
                : reviewWaiveActive
                  ? "Publiser uten kandidatkontroll"
                  : "Publiser intervjuplan"
          }
          onConfirm={confirmPublish}
          onClose={() => setConfirmOpen(false)}
          busy={planTransition === "publishing"}
          tone={publishVisibility === "committee" ? "danger" : undefined}
        >
          <p className="m-0">
            {publishScope === "partial"
              ? `Intervjuer til og med ${formatAccessibleDate(selectedThroughDate)} blir synlige for komiteen. Resten av planen holdes skjult inntil du utvider den.`
              : "Hele planen blir synlig for komiteen."}{" "}
            {publishVisibility === "hidden"
              ? "Kandidatnavn forblir skjult."
              : publishVisibility === "admin_only"
                ? "Kandidatnavn vises bare til opptaksansvarlige."
                : "Kandidatnavn blir synlige for hele komiteen."}
          </p>
          {reviewWaiveActive && (
            <div
              data-cy="waive-review-confirmation"
              className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-ui text-amber-950"
            >
              <strong className="block">
                {waiveReviewTarget
                  ? `Publiseres uten kandidatkontroll fra ${waiveReviewTarget}`
                  : "Publiseres uten fullført kandidatkontroll"}
              </strong>
              <p className="m-0 mt-1 text-detail leading-relaxed">
                Noen paringer går ut uten at det er sjekket for inhabilitet.
                Beslutningen loggføres på deg og vises på den publiserte planen.
              </p>
            </div>
          )}
          {deviationReview?.requires_approval && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-ui text-amber-950">
              <strong className="block">
                Godkjenn {deviationReview.deviation_count} avvik fra oppgitt
                tilgjengelighet
              </strong>
              <p className="m-0 mt-1 text-detail leading-relaxed">
                Godkjenningen gjelder nøyaktig dette planutkastet og blir
                ugyldig dersom planen eller tilgjengeligheten endres.
              </p>
            </div>
          )}
        </ConfirmDialog>
      )}
    </>
  );
};

export default PublicationGate;
