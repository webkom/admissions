import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck,
  Check,
  Clock3,
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
import { iconSizes, iconStrokeWidths } from "src/styles/designTokens";
import type { NameVisibility, SavedSchedule } from "src/types";
import cn from "src/utils/cn";
import type { PublicationReadiness } from "./types";
import type { PublicationStagePresentation } from "./workflowStages";

interface PublicationGateProps {
  savedSchedule: SavedSchedule | undefined;
  readiness: PublicationReadiness;
  planTransition: "publishing" | "unlocking" | null;
  planTransitionError: string;
  stage: PublicationStagePresentation;
  dates: string[];
  onOpenDraft: () => void;
  onOpenOwnReview: () => void;
  onPublish: (
    visibility: NameVisibility,
    deviationApprovalFingerprint?: string,
    distributedThrough?: string,
  ) => Promise<boolean>;
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
  stage,
  dates,
  onOpenDraft,
  onOpenOwnReview,
  onPublish,
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

  const blocker = useMemo(() => {
    if (!readiness.draftSaved) return "Et lagret planutkast mangler.";
    if (!readiness.draftPersistenceReady) {
      return "De siste endringene i planutkastet er ikke ferdig lagret.";
    }
    if (!readiness.candidateScopeResolved) {
      return "Kandidatlisten er ikke ferdig lastet.";
    }
    if (!readiness.allCandidatesScheduled) {
      return `${Math.max(
        0,
        readiness.candidateCount - readiness.scheduledCandidateCount,
      )} kandidat${
        readiness.candidateCount - readiness.scheduledCandidateCount === 1
          ? ""
          : "er"
      } mangler intervju.`;
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
  }, [readiness]);

  const confirmPublish = async () => {
    const published = await onPublish(
      publishVisibility,
      deviationReview?.requires_approval
        ? deviationReview.deviation_fingerprint
        : undefined,
      publishScope === "partial" ? selectedThroughDate : undefined,
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
                  complete={readiness.allCandidatesScheduled}
                  title="Alle kandidater har et intervju"
                  description={
                    readiness.candidateScopeResolved
                      ? `${readiness.scheduledCandidateCount} av ${readiness.candidateCount} kandidater er plassert.`
                      : "Venter på at kandidatlisten skal bli ferdig lastet."
                  }
                />
                <ReadinessRow
                  complete={readiness.reviewResolved}
                  title="Kandidatkontroll bekreftet"
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
              {readiness.ready ? (
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
