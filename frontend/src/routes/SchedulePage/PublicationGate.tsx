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
  CustomSelect,
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
import {
  decodeScheduleTime,
  formatAccessibleDate,
} from "src/components/Scheduling/scheduleUtils";
import PlanDayStrip from "src/components/Scheduling/Solver/PlanDayStrip";
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
  /** Boundary chosen on the day strip before the gate opened. The strip is
   *  the only place publication scope is picked, so the gate reflects that
   *  choice instead of asking again. */
  publishThroughIntent?: string | null;
  onConsumePublishThroughIntent?: () => void;
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
            : "border-warning-border bg-warning-bg text-warning-text",
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
  publishThroughIntent = null,
  onConsumePublishThroughIntent,
}: PublicationGateProps) => {
  const [publishVisibility, setPublishVisibility] = useState<NameVisibility>(
    savedSchedule?.name_visibility ?? "hidden",
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const sortedDates = useMemo(() => [...dates].sort(), [dates]);
  // Scope is decided on the day strip. Absent an explicit boundary the publish
  // covers the whole plan, which is what most rounds do.
  const [partialThroughDate, setPartialThroughDate] = useState<string | null>(
    null,
  );
  useEffect(() => {
    if (!publishThroughIntent) return;
    setPartialThroughDate(publishThroughIntent);
    onConsumePublishThroughIntent?.();
  }, [publishThroughIntent, onConsumePublishThroughIntent]);
  const selectedThroughDate =
    partialThroughDate && sortedDates.includes(partialThroughDate)
      ? partialThroughDate
      : null;
  // Publishing through the last day is a full publish, not a partial one.
  const partialThroughDateOrNull =
    selectedThroughDate && selectedThroughDate < (sortedDates.at(-1) ?? "")
      ? selectedThroughDate
      : null;
  const publishScope: "full" | "partial" = partialThroughDateOrNull
    ? "partial"
    : "full";
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
  const serverReviewRefusal = /må kontrollere/i.test(scheduleFieldError);
  useEffect(() => {
    if (serverReviewRefusal) setWaiveReview(true);
  }, [serverReviewRefusal]);
  // The waiver is a standing option, not a reaction to a failed publish: an
  // admin cannot always see every interviewer's outstanding rows (the other
  // committees' proposed candidates are admin-only), so `readiness` can read
  // "resolved" while the backend still counts unfinished reviewers. Ticking
  // the box always sends `publish_without_full_review`; the server records a
  // bypass only if one actually happened, so ticking it when the check is in
  // fact complete is a harmless no-op.
  const reviewWaiveActive = waiveReview;
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

  // Days holding interviews. Without this the strip would offer to release
  // empty days, which tells the committee nothing and spends a boundary that
  // cannot be moved back.
  const filledDates = useMemo(() => {
    const filled = new Set<string>();
    const duration = savedSchedule?.session_duration ?? 60;
    (savedSchedule?.schedule ?? []).forEach((item) => {
      if (!Number.isFinite(item.time)) return;
      const { dayIndex } = decodeScheduleTime(item.time, duration);
      const date = sortedDates[dayIndex];
      if (date) filled.add(date);
    });
    return filled;
  }, [savedSchedule?.schedule, savedSchedule?.session_duration, sortedDates]);

  // The day strip shows "1 2 3 4 5" without saying what each covers, so the
  // scope is also offered as a list that spells out how many interviews each
  // boundary would reveal. Only days that add interviews and still leave later
  // ones hidden are worth listing as a partial boundary; the first entry is
  // always the whole plan.
  const revealOptions = useMemo(() => {
    const duration = savedSchedule?.session_duration ?? 60;
    const total = savedSchedule?.schedule?.length ?? 0;
    const countByDate = new Map<string, number>();
    (savedSchedule?.schedule ?? []).forEach((item) => {
      if (!Number.isFinite(item.time)) return;
      const { dayIndex } = decodeScheduleTime(item.time, duration);
      const date = sortedDates[dayIndex];
      if (date) countByDate.set(date, (countByDate.get(date) ?? 0) + 1);
    });
    const plannedDates = sortedDates.filter((date) => countByDate.get(date));
    const lastPlanned = plannedDates[plannedDates.length - 1];
    let cumulative = 0;
    const partial: Array<{ value: string; label: string }> = [];
    sortedDates.forEach((date, index) => {
      const onThisDay = countByDate.get(date) ?? 0;
      cumulative += onThisDay;
      if (
        onThisDay > 0 &&
        index < sortedDates.length - 1 &&
        cumulative < total
      ) {
        partial.push({
          value: date,
          label: `T.o.m. ${formatAccessibleDate(date)} — ${cumulative} av ${total} intervjuer`,
        });
      }
    });
    return [
      {
        value: "full",
        label: lastPlanned
          ? `T.o.m. ${formatAccessibleDate(lastPlanned)} — alle ${total} intervjuene`
          : `Alle ${total} intervjuene`,
      },
      ...partial,
    ];
  }, [savedSchedule?.schedule, savedSchedule?.session_duration, sortedDates]);
  // Anything that is not a genuine partial boundary in the list reads as the
  // whole plan - e.g. picking the last planned day while later days sit empty.
  const revealValue =
    partialThroughDateOrNull &&
    revealOptions.some((option) => option.value === partialThroughDateOrNull)
      ? partialThroughDateOrNull
      : "full";

  const unplacedCount = Math.max(
    0,
    readiness.candidateCount - readiness.scheduledCandidateCount,
  );
  // Strict readiness demands every candidate placed. Publishing part of the
  // period is a legitimate state, not an exception to tick past: the
  // candidates who are still waiting get planned when later days open. The
  // acknowledgement belongs in the publish confirmation, which the user reads
  // once, rather than in a checkbox that repeats a choice already made in the
  // draft.
  const deferUnplaced = unplacedCount > 0;
  const unplacedResolved = readiness.allCandidatesScheduled || deferUnplaced;
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
      partialThroughDateOrNull ?? undefined,
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
          {/* The kandidatkontroll refusal is not an error - it is the prompt
              to use the waiver, which the panel on the right now carries. */}
          {planTransitionError && !serverReviewRefusal && (
            <div
              role="alert"
              className="border-b border-danger-border bg-danger-bg px-5 py-3 text-ui font-semibold text-danger"
            >
              {planTransitionError}
            </div>
          )}
          {scheduleFieldError &&
            !planTransitionError &&
            !serverReviewRefusal && (
              <div
                role="alert"
                data-cy="publish-schedule-field-error"
                className="border-b border-warning-border bg-warning-bg px-5 py-3 text-ui text-warning-text"
              >
                {scheduleFieldError}
              </div>
            )}
          {savedSchedule?.published_without_review_by &&
            savedSchedule.published_without_review_by.length > 0 && (
              <div
                data-cy="previously-bypassed-banner"
                className="border-b border-warning-border bg-warning-bg px-5 py-3 text-ui text-warning-text"
              >
                <strong className="block">
                  Forrige publisering ble gjort uten kontroll fra{" "}
                  {savedSchedule.published_without_review_by.join(", ")}
                </strong>
                <p className="m-0 mt-1 text-label leading-relaxed">
                  En ny publisering uten alle svar vil bli loggført på nytt.
                </p>
              </div>
            )}
          <SchedulePanelBody className="grid gap-7 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.42fr)]">
            <section aria-labelledby="publication-checks-heading">
              <h3
                id="publication-checks-heading"
                className="m-0 text-title font-bold text-text-primary"
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
                  title={
                    deferUnplaced
                      ? "Kandidatene er fordelt på planlagte dager"
                      : "Alle kandidater har et intervju"
                  }
                  description={
                    !readiness.candidateScopeResolved
                      ? "Venter på at kandidatlisten skal bli ferdig lastet."
                      : deferUnplaced
                        ? `${readiness.scheduledCandidateCount} av ${readiness.candidateCount} kandidater er plassert. De siste ${unplacedCount} planlegges når flere dager åpnes.`
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

              {(() => {
                const known =
                  serverReviewRefusal ||
                  (!readiness.reviewResolved &&
                    readiness.incompleteReviewerCount > 0);
                return (
                  <aside
                    className={cn(
                      "rounded-xl border p-4",
                      known
                        ? "border-warning-border bg-warning-bg"
                        : "border-border-soft bg-surface-subtle",
                    )}
                    data-cy="waive-review-panel"
                  >
                    <p className={sectionLabelClass}>
                      {known
                        ? "Kandidatkontroll ikke fullført"
                        : "Kandidatkontroll"}
                    </p>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-2 text-ui",
                        known ? "text-warning-text" : "text-text-primary",
                      )}
                      data-cy="waive-review-label"
                    >
                      <input
                        type="checkbox"
                        checked={waiveReview}
                        onChange={(event) =>
                          setWaiveReview(event.target.checked)
                        }
                        data-cy="waive-review"
                        className="mt-0.5 h-4 w-4 flex-none rounded border-border-muted text-primary focus:ring-primary"
                      />
                      <span>{waiveReviewButtonLabel}</span>
                    </label>
                    <p
                      className={cn(
                        "m-0 mt-3 text-detail leading-relaxed",
                        known ? "text-warning-text" : "text-text-muted",
                      )}
                    >
                      {known && scheduleFieldError
                        ? scheduleFieldError
                        : known
                          ? "Noen intervjuere har ikke bekreftet kandidatkontrollen sin ennå."
                          : "Kryss av her hvis planen skal kunne publiseres selv om ikke alle intervjuere rekker kandidatkontrollen."}{" "}
                      Beslutningen loggføres på deg og vises på den publiserte
                      planen, slik at komiteen ser hvilke paringer som gikk ut
                      uten at noen sjekket for inhabilitet.
                    </p>
                  </aside>
                );
              })()}

              {sortedDates.length > 1 && (
                <aside className="rounded-xl bg-surface-subtle p-4">
                  <p className={sectionLabelClass}>Publiseringsomfang</p>
                  {revealOptions.length > 1 && (
                    <div className="mt-2">
                      <CustomSelect
                        compact
                        aria-label="Hvor mye av planen som publiseres"
                        value={revealValue}
                        onChange={(value) =>
                          setPartialThroughDate(value === "full" ? null : value)
                        }
                        options={revealOptions}
                      />
                    </div>
                  )}
                  <div className="mt-2">
                    <PlanDayStrip
                      dates={sortedDates}
                      filledDates={filledDates}
                      distributedThrough={
                        savedSchedule?.is_distributed
                          ? (savedSchedule.distributed_through ?? null)
                          : null
                      }
                      previewThrough={selectedThroughDate}
                      onPublishThrough={setPartialThroughDate}
                      // The gate has its own publish button; a second
                      // suggestion here would compete with it.
                      publishSuggestionReady={false}
                      compact
                    />
                  </div>
                  <p className="m-0 mt-3 text-detail leading-relaxed text-text-muted">
                    {publishScope === "full"
                      ? "Alle intervjuer i planen blir synlige med det samme."
                      : "Intervjuer etter valgt dato holdes skjult for komiteen. Du kan publisere flere dager senere."}
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
                  className="m-0 flex items-center gap-2 text-ui font-semibold text-warning-text"
                >
                  <AlertTriangle size={iconSizes.small} aria-hidden="true" />
                  {blocker}
                </p>
              ) : deviationApprovalPending ? (
                <p className="m-0 flex items-center gap-2 text-ui font-semibold text-warning-text">
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
                      : partialThroughDateOrNull
                        ? `Publiser til og med ${formatAccessibleDate(partialThroughDateOrNull)}`
                        : deferUnplaced && unplacedCount > 0
                          ? `Publiser det som er klart (${unplacedCount} senere)`
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
              : partialThroughDateOrNull
                ? `Publiser til og med ${formatAccessibleDate(partialThroughDateOrNull)}`
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
            {partialThroughDateOrNull
              ? `Intervjuer til og med ${formatAccessibleDate(partialThroughDateOrNull)} blir synlige for komiteen. Resten av planen publiserer du når du er klar.`
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
              className="mt-4 rounded-md border border-warning-border bg-warning-bg px-3 py-3 text-ui text-warning-text"
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
          {deferUnplaced && (
            <div
              data-cy="defer-unplaced-confirmation"
              className="mt-4 rounded-md border border-warning-border bg-warning-bg px-3 py-3 text-ui text-warning-text"
            >
              <strong className="block">
                {unplacedCount} kandidat{unplacedCount === 1 ? "" : "er"} står
                fortsatt uten intervju
              </strong>
              <p className="m-0 mt-1 text-detail leading-relaxed">
                De planlegges når flere dager åpnes. Planutkastet viser hele
                tiden hvem som venter.
              </p>
            </div>
          )}
          {deviationReview?.requires_approval && (
            <div className="mt-4 rounded-md border border-warning-border bg-warning-bg px-3 py-3 text-ui text-warning-text">
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
