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
import { iconSizes } from "src/styles/designTokens";
import type { NameVisibility, SavedSchedule } from "src/types";
import cn from "src/utils/cn";
import type { PublicationReadiness } from "./types";

interface PublicationGateProps {
  savedSchedule: SavedSchedule | undefined;
  readiness: PublicationReadiness;
  currentReviewRequired: boolean;
  currentReviewComplete: boolean;
  planTransition: "publishing" | "unlocking" | null;
  planTransitionError: string;
  onOpenDraft: () => void;
  onOpenOwnReview: () => void;
  onPublish: (
    visibility: NameVisibility,
    deviationApprovalFingerprint?: string,
  ) => Promise<boolean>;
}

interface ReadinessRowProps {
  complete: boolean;
  title: string;
  description: string;
  action?: React.ReactNode;
}

const ReadinessRow = ({
  complete,
  title,
  description,
  action,
}: ReadinessRowProps) => (
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
          <Check size={14} strokeWidth={3} aria-hidden="true" />
        ) : (
          <Clock3 size={13} aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0">
        <p className="m-0 text-ui font-semibold text-text-primary">{title}</p>
        <p className="m-0 mt-1 text-detail leading-relaxed text-text-muted">
          {description}
        </p>
      </div>
    </div>
    {!complete && action}
  </li>
);

const PublicationGate = ({
  savedSchedule,
  readiness,
  currentReviewRequired,
  currentReviewComplete,
  planTransition,
  planTransitionError,
  onOpenDraft,
  onOpenOwnReview,
  onPublish,
}: PublicationGateProps) => {
  const [publishVisibility, setPublishVisibility] = useState<NameVisibility>(
    savedSchedule?.name_visibility ?? "hidden",
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deviationReview = savedSchedule?.deviation_review;
  const deviationApprovalPending = Boolean(
    deviationReview?.requires_approval && !deviationReview.approved,
  );

  useEffect(() => {
    setPublishVisibility(savedSchedule?.name_visibility ?? "hidden");
  }, [savedSchedule?.name_visibility]);

  const blocker = useMemo(() => {
    if (!readiness.draftSaved) return "Et lagret planutkast mangler.";
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
      <SchedulePanel dataCy="publication-gate">
        <SchedulePanelHeader
          icon={CalendarCheck}
          title="Klar for publisering"
          description="Kontroller kravene én gang, velg hvem som kan se kandidatnavnene, og publiser planen."
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
                action={
                  <button
                    type="button"
                    onClick={onOpenDraft}
                    className={cn(actionButtonBase, actionButtonNeutral)}
                  >
                    Åpne planutkast
                  </button>
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
                action={
                  <button
                    type="button"
                    onClick={onOpenDraft}
                    className={cn(actionButtonBase, actionButtonNeutral)}
                  >
                    Løs i planutkast
                  </button>
                }
              />
              <ReadinessRow
                complete={readiness.reviewResolved}
                title="Kandidatkontroll bekreftet"
                description={reviewDescription}
                action={
                  currentReviewRequired && !currentReviewComplete ? (
                    <button
                      type="button"
                      onClick={onOpenOwnReview}
                      className={cn(actionButtonBase, actionButtonPrimary)}
                    >
                      Kontroller kandidater
                    </button>
                  ) : undefined
                }
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
                action={
                  <button
                    type="button"
                    onClick={onOpenDraft}
                    className={cn(actionButtonBase, actionButtonNeutral)}
                  >
                    Reparer utkast
                  </button>
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

          <aside className="rounded-xl bg-surface-subtle p-4">
            <p className={sectionLabelClass}>Kandidatnavn etter publisering</p>
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
              disabled={!readiness.ready || planTransition !== null}
              onClick={() => setConfirmOpen(true)}
              data-cy="publish-plan"
              className={cn(actionButtonBase, actionButtonPrimary)}
            >
              {planTransition === "publishing"
                ? "Publiserer…"
                : "Publiser intervjuplan"}
            </button>
          </div>
        </SchedulePanelFooter>
      </SchedulePanel>

      {confirmOpen && (
        <ConfirmDialog
          title="Publiser intervjuplan"
          confirmLabel={
            planTransition === "publishing"
              ? "Publiserer…"
              : "Publiser intervjuplan"
          }
          onConfirm={confirmPublish}
          onClose={() => setConfirmOpen(false)}
          busy={planTransition === "publishing"}
          tone={publishVisibility === "committee" ? "danger" : undefined}
        >
          <p className="m-0">
            Planen blir synlig for komiteen.{" "}
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
