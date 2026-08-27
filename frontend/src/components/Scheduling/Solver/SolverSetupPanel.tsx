import React, {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  AlertTriangle,
  Check,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

import {
  SchedulePanel,
  SchedulePanelBody,
  SchedulePanelFooter,
  SchedulePanelHeader,
  SegmentedControl,
  actionButtonBase,
  actionButtonNeutral,
  actionButtonPrimary,
  keyboardFocusRingClass,
  sectionLabelClass,
} from "../ui";
import type { ExperienceLevel, Interviewer, SolverOptions } from "../types";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";
import { ADVANCED_SOLVER_DEFAULTS, type SolveJob } from "./solverHelpers";
import type { SolverReadiness } from "./solverSelectors";
import AdvancedSolverSettings from "./AdvancedSolverSettings";
import SolveProgress from "./SolveProgress";

interface SolverSetupPanelProps {
  interviewerCount: number;
  experiencedInterviewerCount: number;
  interviewers: Interviewer[];
  solverOptions: SolverOptions;
  onSolverOptionsChange: Dispatch<SetStateAction<SolverOptions>>;
  onExperienceLevelChange: (
    userId: string,
    experienceLevel: ExperienceLevel,
  ) => Promise<void>;
  panelSize: number;
  onPanelSizeChange: (value: number) => void;
  openBlockCount: number;
  interviewSlotCount: number;
  readiness: SolverReadiness;
  availabilityReady: boolean;
  loading: boolean;
  error: string;
  elapsedMs: number;
  jobStatus: SolveJob["status"] | null;
  estimatedSeconds: number;
  lockedCount: number;
  hasProposal: boolean;
  changeableInterviewCount: number;
  currentDraftReady: boolean;
  candidateScopeResolved: boolean;
  regenerationOpen: boolean;
  onCloseRegeneration: () => void;
  onSolve: () => void;
  onCancel: () => void;
  onOpenAvailability: () => void;
  onOpenFramework: () => void;
  onOpenConflictReview: () => void;
  // False when the inhabilitet review is closed, so the blocked action can
  // point somewhere that works instead of a panel that will not render.
  conflictReviewReachable: boolean;
}

const ExperienceEditor = ({
  interviewers,
  savingId,
  headingRef,
  onChange,
  onClose,
}: {
  interviewers: Interviewer[];
  savingId: string;
  headingRef: React.RefObject<HTMLHeadingElement>;
  onChange: (userId: string, experienceLevel: ExperienceLevel) => void;
  onClose: () => void;
}) => (
  <section
    data-cy="inline-experience-editor"
    className="rounded-lg border border-border-soft bg-surface-subtle px-4 py-3"
    aria-labelledby="inline-experience-editor-heading"
  >
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3
          ref={headingRef}
          id="inline-experience-editor-heading"
          tabIndex={-1}
          className="m-0 text-ui font-semibold text-text-primary focus:outline-none"
        >
          Erfarne intervjuere
        </h3>
        <p className="m-0 mt-1 text-detail text-text-muted">
          Velg hvem som kan dekke erfaringskravet. Bare intervjuere som deltar
          teller i planutkastet.
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className={cn(
          "text-detail font-semibold text-brand hover:underline",
          keyboardFocusRingClass,
        )}
      >
        Skjul
      </button>
    </div>

    <div className="mt-3 grid gap-3">
      {interviewers.map((interviewer) => (
        <div
          key={interviewer.id}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="m-0 font-semibold text-text-primary">
              {interviewer.name}
            </p>
            <p className="m-0 mt-0.5 text-detail text-text-muted">
              {interviewer.participation === "awaiting_response"
                ? "Mangler svar"
                : "Deltar"}
            </p>
          </div>
          <SegmentedControl<ExperienceLevel>
            value={interviewer.experience_level ?? "unknown"}
            aria-label={`Erfaringsnivå for ${interviewer.name} i planutkast`}
            onChange={(value) => onChange(interviewer.id, value)}
            items={[
              {
                key: "unknown",
                label: "Ukjent",
                disabled: savingId === interviewer.id,
              },
              {
                key: "inexperienced",
                label: "Uerfaren",
                disabled: savingId === interviewer.id,
              },
              {
                key: "experienced",
                label: "Erfaren",
                disabled: savingId === interviewer.id,
              },
            ]}
          />
        </div>
      ))}
    </div>
  </section>
);

interface SamplePlanPreviewProps {
  interviewerCount: number;
  panelSize: number;
  solverOptions: SolverOptions;
}

const panelMemberLabel = (
  panelSize: number,
  interviewerCount: number,
  offset: number,
) => {
  const poolSize = Math.max(interviewerCount, panelSize, 1);
  const visibleCount = Math.min(panelSize, 3);
  const members = Array.from({ length: visibleCount }, (_, index) => {
    const memberIndex = (offset + index) % poolSize;
    return `Intervjuer ${String.fromCharCode(65 + (memberIndex % 26))}`;
  });
  const remainingCount = Math.max(0, panelSize - visibleCount);
  return remainingCount > 0
    ? `${members.join(", ")} + ${remainingCount}`
    : members.join(", ");
};

const SamplePlanPreview = ({
  interviewerCount,
  panelSize,
  solverOptions,
}: SamplePlanPreviewProps) => {
  // The default strategy (balanced) and panel-stability (preferred) are
  // no longer user-configurable, so the sample table always shows the
  // same "rotate between blocks, same panel within a block" shape that
  // balanced + preferred would produce. Within-block rotation is off
  // (preferred keeps the panel stable inside a block); between-block
  // rotation is on (the rest-between-blocks default).
  const rotateWithinBlock = false;
  const rotateBetweenBlocks = true;
  const sampleRows = [
    {
      block: "Man morgen",
      interview: "08:00 intervju 1",
      blockIndex: 0,
      withinBlockIndex: 0,
    },
    {
      block: "Man morgen",
      interview: "08:30 intervju 2",
      blockIndex: 0,
      withinBlockIndex: 1,
    },
    {
      block: "Tir morgen",
      interview: "08:00 intervju 3",
      blockIndex: 1,
      withinBlockIndex: 0,
    },
    {
      block: "Tir morgen",
      interview: "08:30 intervju 4",
      blockIndex: 1,
      withinBlockIndex: 1,
    },
  ];
  const rows = sampleRows.map((row) => {
    const betweenBlockRotation = rotateBetweenBlocks
      ? row.blockIndex * panelSize
      : 0;
    return {
      ...row,
      offset:
        betweenBlockRotation + (rotateWithinBlock ? row.withinBlockIndex : 0),
    };
  });
  const activeRequirements = [
    solverOptions.enforce_same_gender ? "Samme kjønn" : null,
    solverOptions.require_experienced_panel ? "Erfaren intervjuer" : null,
  ].filter(Boolean);

  return (
    <aside
      data-cy="generation-sample-preview"
      data-panel-size={panelSize}
      className="min-w-0 border-t border-border-soft pt-6 tablet:sticky tablet:top-4 tablet:border-l tablet:border-t-0 tablet:pl-7 tablet:pt-0"
      aria-labelledby="generation-preview-heading"
    >
      <p className={sectionLabelClass}>Eksempel</p>

      <div className="mt-4 overflow-hidden rounded-md border border-border-soft bg-surface-base">
        <table
          data-cy="generation-sample-table"
          className="w-full border-collapse text-left text-detail"
        >
          <thead className="bg-surface-muted text-text-muted">
            <tr>
              <th className="!rounded-none !bg-transparent px-3 py-2 font-semibold">
                Blokk
              </th>
              <th className="!rounded-none !bg-transparent px-3 py-2 font-semibold">
                Eksempel
              </th>
              <th className="!rounded-none !bg-transparent px-3 py-2 font-semibold">
                Panel
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.interview}
                data-cy="generation-sample-row"
                className={cn(
                  "border-t border-border-faint",
                  index > 0 &&
                    rows[index - 1].block !== row.block &&
                    "border-t-2 border-border-soft",
                )}
              >
                <td
                  data-cy="generation-sample-period"
                  className="px-3 py-2 font-semibold text-text-muted"
                >
                  {row.block}
                </td>
                <td className="px-3 py-2 font-semibold text-text-primary">
                  {row.interview}
                </td>
                <td
                  data-cy="generation-sample-panel"
                  className="px-3 py-2 text-text-muted"
                >
                  {panelMemberLabel(panelSize, interviewerCount, row.offset)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="m-0 mt-4 divide-y divide-border-soft border-y border-border-soft text-detail">
        <div className="grid grid-cols-[var(--schedule-preview-label-width)_minmax(0,1fr)] gap-3 py-2.5">
          <dt className="font-semibold text-text-subtle">Fordeling</dt>
          <dd className="m-0 text-text-primary">
            Balansert — kort og jevn arbeidsmengde
          </dd>
        </div>
        <div className="grid grid-cols-[var(--schedule-preview-label-width)_minmax(0,1fr)] gap-3 py-2.5">
          <dt className="font-semibold text-text-subtle">Panel i blokk</dt>
          <dd className="m-0 text-text-primary">Foretrekk samme panel</dd>
        </div>
        <div className="grid grid-cols-[var(--schedule-preview-label-width)_minmax(0,1fr)] gap-3 py-2.5">
          <dt className="font-semibold text-text-subtle">Mellom blokker</dt>
          <dd className="m-0 text-text-primary">
            Panelet roteres for å gi hvile
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <p className="m-0 text-label font-bold uppercase tracking-wide text-text-subtle">
          Krav i eksemplet
        </p>
        {activeRequirements.length > 0 ? (
          <div
            data-cy="generation-preview-requirements"
            className="mt-1 flex flex-wrap gap-2"
          >
            {activeRequirements.map((requirement) => (
              <span
                key={requirement}
                className="rounded-full border border-border-soft bg-surface-muted px-2.5 py-1 text-detail text-text-muted"
              >
                {requirement}
              </span>
            ))}
          </div>
        ) : (
          <p
            data-cy="generation-preview-requirements"
            className="m-0 mt-1 text-detail text-text-muted"
          >
            Ingen ekstra panelkrav
          </p>
        )}
      </div>
    </aside>
  );
};

const SolverSetupPanel = ({
  interviewerCount,
  experiencedInterviewerCount,
  interviewers,
  solverOptions,
  onSolverOptionsChange,
  onExperienceLevelChange,
  panelSize,
  onPanelSizeChange,
  readiness,
  availabilityReady,
  loading,
  error,
  elapsedMs,
  jobStatus,
  estimatedSeconds,
  lockedCount,
  hasProposal,
  changeableInterviewCount,
  currentDraftReady,
  candidateScopeResolved,
  regenerationOpen,
  onCloseRegeneration,
  onSolve,
  onCancel,
  onOpenAvailability,
  onOpenFramework,
  onOpenConflictReview,
  conflictReviewReachable,
}: SolverSetupPanelProps) => {
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
  const [experienceEditorOpen, setExperienceEditorOpen] = useState(false);
  const [experienceSavingId, setExperienceSavingId] = useState("");
  const configurationRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const advancedSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const advancedSettingsHeadingRef = useRef<HTMLHeadingElement>(null);
  const experienceEditorHeadingRef = useRef<HTMLHeadingElement>(null);
  const participatingInterviewers = interviewers.filter(
    (interviewer) => interviewer.participation !== "not_participating",
  );

  // These three effects used to defer their focus() call by one
  // requestAnimationFrame. That's unnecessary - a useEffect body already
  // runs after React has committed and painted, so the target ref is
  // already attached by the time any of these run - and it's actively
  // harmful under a starved rAF: a test (or a real user on a loaded
  // machine) that acts before that deferred frame finally fires lands on
  // whatever had focus before, not the panel that just opened, most
  // visibly when the panel's own Escape handler never sees the keydown
  // because focus never made it inside the panel to receive it.
  useEffect(() => {
    if (!regenerationOpen) return;
    configurationRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
    headingRef.current?.focus({ preventScroll: true });
  }, [regenerationOpen]);

  useEffect(() => {
    if (!experienceEditorOpen) return;
    experienceEditorHeadingRef.current?.focus({ preventScroll: true });
  }, [experienceEditorOpen]);

  useEffect(() => {
    if (!advancedSettingsOpen) return;
    advancedSettingsHeadingRef.current?.focus({ preventScroll: true });
  }, [advancedSettingsOpen]);

  const panelFormationImpossible = interviewerCount < panelSize;
  const generationBlocked =
    !currentDraftReady ||
    !candidateScopeResolved ||
    panelFormationImpossible ||
    (solverOptions.require_experienced_panel &&
      experiencedInterviewerCount === 0) ||
    !availabilityReady ||
    !readiness.ready;
  const conflictBlockedCandidate = readiness.conflictBlockedCandidates[0];
  const capabilityBlockedCandidate = readiness.capabilityBlockedCandidates[0];

  const resetAdvancedOptions = () => {
    onSolverOptionsChange((current) => ({
      ...current,
      enforce_same_gender: ADVANCED_SOLVER_DEFAULTS.enforce_same_gender,
      require_experienced_panel:
        ADVANCED_SOLVER_DEFAULTS.require_experienced_panel,
    }));
  };

  const openAdvancedSettings = () => setAdvancedSettingsOpen(true);
  const openExperienceSetup = () => {
    setAdvancedSettingsOpen(false);
    setExperienceEditorOpen(true);
  };
  const closeAdvancedSettings = () => {
    setAdvancedSettingsOpen(false);
    // The toggle button is always mounted (unlike the panel it opens), so
    // there's nothing to wait a frame for: focusing it now, before React
    // unmounts the panel underneath the currently-focused element, moves
    // focus away first - the browser only auto-blurs to body when the
    // element that still HAS focus gets removed, and by commit time that's
    // no longer this button. A requestAnimationFrame defer here bought
    // nothing but an unbounded wait under a starved rAF.
    advancedSettingsButtonRef.current?.focus({ preventScroll: true });
  };
  const updateExperienceLevel = (
    userId: string,
    experienceLevel: ExperienceLevel,
  ) => {
    setExperienceSavingId(userId);
    void onExperienceLevelChange(userId, experienceLevel).finally(() =>
      setExperienceSavingId(""),
    );
  };

  const blockedDescription = !currentDraftReady
    ? "Vent til endringene i utkastet er lagret før du lager et nytt forslag."
    : panelFormationImpossible
      ? `Velg maksimalt ${interviewerCount} per intervju.`
      : solverOptions.require_experienced_panel &&
          experiencedInterviewerCount === 0
        ? "Klassifiser minst én deltakende intervjuer som erfaren, eller slå av erfaringskravet."
        : !availabilityReady
          ? "Vent til alle intervjuere har svart eller meldt at de ikke deltar."
          : conflictBlockedCandidate
            ? `${conflictBlockedCandidate.candidate.name} har ${
                conflictBlockedCandidate.eligibleInterviewerCount === 0
                  ? "ingen habile intervjuere"
                  : conflictBlockedCandidate.eligibleInterviewerCount === 1
                    ? "bare én habil intervjuer"
                    : `bare ${conflictBlockedCandidate.eligibleInterviewerCount} habile intervjuere`
              }, mens panelet krever ${panelSize}. Kontroller registrert inhabilitet før du genererer på nytt.`
            : capabilityBlockedCandidate
              ? `${capabilityBlockedCandidate.candidate.name} kan ikke få et panel som oppfyller ${
                  capabilityBlockedCandidate.reasons.length === 2
                    ? "kravene til erfaring og kjønn"
                    : capabilityBlockedCandidate.reasons[0] === "experience"
                      ? "kravet om en erfaren intervjuer"
                      : "kravet om samme kjønn"
                }. Juster reglene eller intervjuergruppen før du genererer på nytt.`
              : readiness.neededCapacity === 0
                ? "Ingen kandidater er lagt til i dette opptaket ennå."
                : readiness.usableSlotCount <
                    readiness.neededCapacity / Math.max(panelSize, 1)
                  ? "Det er ikke nok åpne intervjutider med full paneldekning."
                  : "Intervjuerne har ikke nok samlet tilgjengelig kapasitet.";
  const blockedAction = !currentDraftReady
    ? null
    : !candidateScopeResolved
      ? null
      : panelFormationImpossible
        ? interviewerCount > 0
          ? {
              label: `Bruk ${interviewerCount} per intervju`,
              run: () => onPanelSizeChange(interviewerCount),
            }
          : { label: "Se intervjuere", run: onOpenAvailability }
        : solverOptions.require_experienced_panel &&
            experiencedInterviewerCount === 0
          ? {
              label: "Velg erfarne intervjuere",
              run: openExperienceSetup,
            }
          : !availabilityReady
            ? { label: "Se hvem som mangler", run: onOpenAvailability }
            : conflictBlockedCandidate
              ? conflictReviewReachable
                ? {
                    label: "Endre mitt svar",
                    run: onOpenConflictReview,
                  }
                : // With the review closed there is nothing to reopen, so send
                  // the admin to where the registered inhabilitet is visible
                  // rather than to a panel that will not render.
                  {
                    label: "Se registrert inhabilitet",
                    run: onOpenAvailability,
                  }
              : capabilityBlockedCandidate
                ? capabilityBlockedCandidate.reasons.length === 1 &&
                  capabilityBlockedCandidate.reasons[0] === "experience"
                  ? {
                      label: "Velg erfarne intervjuere",
                      run: openExperienceSetup,
                    }
                  : {
                      label: "Tilpass regler",
                      run: openAdvancedSettings,
                    }
                : readiness.neededCapacity === 0
                  ? null
                  : readiness.usableSlotCount <
                      readiness.neededCapacity / Math.max(panelSize, 1)
                    ? { label: "Juster tidsoppsettet", run: onOpenFramework }
                    : { label: "Se tilgjengelighet", run: onOpenAvailability };

  const showConfiguration = !hasProposal || regenerationOpen;

  return (
    <>
      {showConfiguration && (
        <div
          ref={configurationRef}
          data-cy={
            hasProposal ? "regeneration-settings" : "generation-settings"
          }
          className="mx-auto w-full max-w-page scroll-mt-4"
        >
          <SchedulePanel
            dataCy="generation-status"
            stage={
              hasProposal
                ? "regeneration_setup"
                : loading
                  ? "generating"
                  : "recommended_setup"
            }
          >
            <SchedulePanelHeader
              icon={Sparkles}
              headingRef={headingRef}
              headingDataCy="schedule-stage-heading"
              title={hasProposal ? "Lag et nytt forslag" : "Lag planutkast"}
              description={
                hasProposal
                  ? "Det gjeldende utkastet beholdes til du eventuelt velger det nye forslaget."
                  : undefined
              }
              actions={
                hasProposal ? (
                  <button
                    type="button"
                    onClick={onCloseRegeneration}
                    className={cn(actionButtonBase, actionButtonNeutral)}
                  >
                    Tilbake til planutkast
                  </button>
                ) : undefined
              }
            />
            <SchedulePanelBody className="space-y-5 px-5 py-5">
              {hasProposal && lockedCount > 0 && (
                <p className="m-0 rounded-md bg-surface-subtle px-3 py-2 text-detail text-text-muted">
                  {lockedCount} låste intervjuer beholdes;{" "}
                  {changeableInterviewCount} kan flyttes.
                </p>
              )}

              <section className="flex flex-wrap items-center justify-between gap-4 border-y border-border-soft py-4">
                <div className="min-w-0">
                  <p className="m-0 text-label font-bold uppercase tracking-wide text-text-subtle">
                    Valgt oppsett
                  </p>
                  <h3 className="m-0 mt-1 text-base font-semibold text-text-primary">
                    {panelSize} intervjuer{panelSize === 1 ? "" : "e"} per
                    intervju
                    {solverOptions.candidates_per_session > 1
                      ? `, ${solverOptions.candidates_per_session} kandidater per intervju`
                      : ""}
                  </h3>
                </div>
                <button
                  ref={advancedSettingsButtonRef}
                  type="button"
                  onClick={
                    advancedSettingsOpen
                      ? closeAdvancedSettings
                      : openAdvancedSettings
                  }
                  data-cy="open-advanced-generation-settings"
                  aria-expanded={advancedSettingsOpen}
                  aria-controls="advanced-generation-settings"
                  className={cn(actionButtonBase, actionButtonNeutral)}
                >
                  <SlidersHorizontal
                    size={iconSizes.small}
                    aria-hidden="true"
                  />
                  {advancedSettingsOpen ? "Skjul oppsett" : "Tilpass oppsett"}
                </button>
              </section>

              {advancedSettingsOpen && (
                <AdvancedSolverSettings
                  headingRef={advancedSettingsHeadingRef}
                  interviewerCount={interviewerCount}
                  experiencedInterviewerCount={experiencedInterviewerCount}
                  panelSize={panelSize}
                  onPanelSizeChange={onPanelSizeChange}
                  solverOptions={solverOptions}
                  onSolverOptionsChange={onSolverOptionsChange}
                  onOpenExperienceEditor={openExperienceSetup}
                  onReset={resetAdvancedOptions}
                  onClose={closeAdvancedSettings}
                  preview={
                    <SamplePlanPreview
                      interviewerCount={interviewerCount}
                      panelSize={panelSize}
                      solverOptions={solverOptions}
                    />
                  }
                />
              )}

              {experienceEditorOpen && participatingInterviewers.length > 0 && (
                <ExperienceEditor
                  interviewers={participatingInterviewers}
                  savingId={experienceSavingId}
                  headingRef={experienceEditorHeadingRef}
                  onChange={updateExperienceLevel}
                  onClose={() => setExperienceEditorOpen(false)}
                />
              )}

              {error && !hasProposal && (
                <div
                  role="alert"
                  className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-ui font-semibold text-danger"
                >
                  {error}
                </div>
              )}

              {!error &&
                (!candidateScopeResolved ? (
                  <p
                    role="status"
                    className="m-0 text-detail font-semibold text-text-muted"
                  >
                    Henter kandidater…
                  </p>
                ) : generationBlocked ? (
                  <div
                    role="alert"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 px-4 py-3"
                  >
                    <p className="m-0 flex items-start gap-2 text-ui font-semibold text-amber-900">
                      <AlertTriangle
                        size={iconSizes.small}
                        className="mt-0.5 flex-none"
                        aria-hidden="true"
                      />
                      {blockedDescription}
                    </p>
                    {blockedAction && (
                      <button
                        type="button"
                        onClick={blockedAction.run}
                        className={cn(
                          "text-ui font-semibold text-brand hover:underline",
                          keyboardFocusRingClass,
                        )}
                      >
                        {blockedAction.label}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="m-0 flex items-center gap-2 text-detail font-semibold text-success">
                    <Check size={iconSizes.small} aria-hidden="true" />
                    Klar til å generere.
                  </p>
                ))}
            </SchedulePanelBody>

            {loading && (
              <SolveProgress
                elapsedMs={elapsedMs}
                estimatedSeconds={estimatedSeconds}
                jobStatus={jobStatus}
              />
            )}

            <SchedulePanelFooter className="justify-end">
              <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
                {loading && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className={cn(
                      actionButtonBase,
                      actionButtonNeutral,
                      "handheld:flex-1",
                    )}
                  >
                    Avbryt
                  </button>
                )}
                {!loading && (
                  <button
                    type="button"
                    onClick={onSolve}
                    disabled={generationBlocked}
                    data-cy="generate-proposal"
                    data-stage-primary="true"
                    className={cn(
                      actionButtonBase,
                      actionButtonPrimary,
                      "handheld:flex-1",
                    )}
                  >
                    <Sparkles size={iconSizes.small} aria-hidden="true" />
                    {hasProposal ? "Lag nytt forslag" : "Lag planutkast"}
                  </button>
                )}
              </div>
            </SchedulePanelFooter>
          </SchedulePanel>
        </div>
      )}
    </>
  );
};

export default SolverSetupPanel;
