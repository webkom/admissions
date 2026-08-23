import * as React from "react";
import { CalendarRange, UserMinus } from "lucide-react";
import { iconSizes } from "src/styles/designTokens";
import type { InterviewerParticipation } from "src/types";
import cn from "src/utils/cn";
import {
  buildBlockTimeChunks,
  formatDateHeader,
  formatMinutes,
  makeSlotKey,
} from "../scheduleUtils";
import {
  SchedulePanel,
  SchedulePanelHeader,
  SchedulePanelBody,
  SchedulePanelFooter,
  MetaValue,
  SaveButton,
  actionButtonBase,
  actionButtonNeutral,
  keyboardFocusRingClass,
} from "../ui";
import {
  ScheduleGridLegendItem,
  scheduleOpenLegendStyle,
} from "./ScheduleGridFrame";
import SelectableScheduleGrid from "./SelectableScheduleGrid";

interface TimeSchedulerProps {
  enabledSlots?: Set<string>;
  selectedSlots?: Set<string>;
  onSlotsChange?: (slots: Set<string>) => void;
  /**
   * "Helst ikke" slots, disjoint from selectedSlots. Passing this (with
   * onDiscouragedChange) turns the grid tri-state; omitting it leaves the
   * plain available/unavailable behaviour untouched.
   */
  discouragedSlots?: Set<string>;
  onDiscouragedChange?: (slots: Set<string>) => void;
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  onSave?: (slots: Set<string>, discouraged: Set<string>) => Promise<void>;
  onSaveSuccess?: () => void;
  /** Unsaved work outside the grid (e.g. fadderbarn), sharing the grid's
   * unsaved-changes hint and beforeunload guard. */
  extraDirty?: boolean;
  sessionDuration: number;
  dates: string[];
  participation?: InterviewerParticipation;
  affectedAssignmentCount?: number;
  onOptOut?: () => Promise<void>;
  onRejoin?: () => Promise<void>;
  stage?: string;
  foundationNav?: React.ReactNode;
  /** Rendered under the grid, above the save button, so it is answered in the
   *  same action as the availability itself. */
  extraSection?: React.ReactNode;
}

const TimeScheduler: React.FC<TimeSchedulerProps> = ({
  enabledSlots,
  selectedSlots: externalSelectedSlots,
  onSlotsChange,
  discouragedSlots,
  onDiscouragedChange,
  dayStartMinute,
  dayEndMinute,
  chunkSize,
  chunkBreakMinutes,
  onSave,
  onSaveSuccess,
  extraDirty,
  sessionDuration,
  dates,
  participation,
  affectedAssignmentCount = 0,
  onOptOut,
  onRejoin,
  stage,
  foundationNav,
  extraSection,
}) => {
  const [internalSelectedSlots, setInternalSelectedSlots] = React.useState<
    Set<string>
  >(new Set());
  const selectedSlots = externalSelectedSlots ?? internalSelectedSlots;
  const setSelectedSlots = onSlotsChange ?? setInternalSelectedSlots;
  const supportsDiscouraged = Boolean(discouragedSlots && onDiscouragedChange);
  const discouraged = React.useMemo(
    () => discouragedSlots ?? new Set<string>(),
    [discouragedSlots],
  );
  // Which of the two answers a drag paints. The grid itself stays a plain
  // binary selection; the mode decides which set a newly painted slot lands
  // in, so no existing drag/keyboard behaviour has to change.
  const [paintMode, setPaintMode] = React.useState<"available" | "discouraged">(
    "available",
  );
  // What the grid renders as "on" is both answers together, so painting in
  // one mode visibly deselects in the other.
  const gridActiveSlots = React.useMemo(
    () => new Set([...selectedSlots, ...discouraged]),
    [selectedSlots, discouraged],
  );

  const [isSaving, setIsSaving] = React.useState(false);
  const [saveTick, setSaveTick] = React.useState(0);
  const [dirtySinceSave, setDirtySinceSave] = React.useState(false);
  const [confirmOptOut, setConfirmOptOut] = React.useState(false);
  const [participationSaving, setParticipationSaving] = React.useState(false);
  const optOutTriggerRef = React.useRef<HTMLButtonElement>(null);
  const optOutCancelRef = React.useRef<HTMLButtonElement>(null);
  const rejoinButtonRef = React.useRef<HTMLButtonElement>(null);
  const previousParticipationRef = React.useRef(participation);
  const restoreOptOutFocusRef = React.useRef(false);

  React.useLayoutEffect(() => {
    if (confirmOptOut) {
      if (!participationSaving) optOutCancelRef.current?.focus();
      return;
    }
    if (!restoreOptOutFocusRef.current) return;
    restoreOptOutFocusRef.current = false;
    (rejoinButtonRef.current ?? optOutTriggerRef.current)?.focus();
  }, [confirmOptOut, participationSaving]);
  React.useLayoutEffect(() => {
    if (
      participation === "not_participating" &&
      previousParticipationRef.current !== "not_participating"
    ) {
      rejoinButtonRef.current?.focus();
    }
    previousParticipationRef.current = participation;
  }, [participation]);

  const chunks = React.useMemo(() => {
    return buildBlockTimeChunks({
      dayStartMinute,
      dayEndMinute,
      sessionDuration,
      chunkSize,
      chunkBreakMinutes,
    });
  }, [
    dayStartMinute,
    dayEndMinute,
    sessionDuration,
    chunkSize,
    chunkBreakMinutes,
  ]);

  const isSlotEnabled = (date: string, minute: number): boolean => {
    if (!enabledSlots) return true;
    return enabledSlots.has(makeSlotKey(date, minute));
  };

  const handleGridChange = React.useCallback(
    (nextSlots: Set<string>) => {
      if (!supportsDiscouraged) {
        setSelectedSlots(nextSlots);
        setDirtySinceSave(true);
        return;
      }
      // The grid hands back the combined selection. Split it by the active
      // mode: newly painted slots join that mode's set, and each slot lives
      // in exactly one of the two.
      const nextAvailable = new Set<string>();
      const nextDiscouraged = new Set<string>();
      nextSlots.forEach((slot) => {
        const wasAvailable = selectedSlots.has(slot);
        const wasDiscouraged = discouraged.has(slot);
        if (!wasAvailable && !wasDiscouraged) {
          if (paintMode === "discouraged") nextDiscouraged.add(slot);
          else nextAvailable.add(slot);
          return;
        }
        if (wasDiscouraged) nextDiscouraged.add(slot);
        else nextAvailable.add(slot);
      });
      setSelectedSlots(nextAvailable);
      onDiscouragedChange?.(nextDiscouraged);
      setDirtySinceSave(true);
    },
    [
      discouraged,
      onDiscouragedChange,
      paintMode,
      selectedSlots,
      setSelectedSlots,
      supportsDiscouraged,
    ],
  );

  const hasUnsavedWork = dirtySinceSave || Boolean(extraDirty);

  React.useEffect(() => {
    if (!hasUnsavedWork) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedWork]);

  const handleSave = async () => {
    if (!onSave) return;
    const normalized = new Set<string>();
    dates.forEach((date) => {
      chunks.forEach((chunk) => {
        const enabledInChunk = chunk.filter((m) => isSlotEnabled(date, m));
        const hasSelection = enabledInChunk.some((m) =>
          selectedSlots.has(makeSlotKey(date, m)),
        );
        if (!hasSelection) return;
        enabledInChunk.forEach((m) => normalized.add(makeSlotKey(date, m)));
      });
    });
    if (normalized.size !== selectedSlots.size) setSelectedSlots(normalized);
    // Whole-block normalisation above can pull a discouraged minute into the
    // available set; keep the two disjoint so the server never sees a slot
    // claimed by both.
    const normalizedDiscouraged = new Set(
      [...discouraged].filter((slot) => !normalized.has(slot)),
    );
    setIsSaving(true);
    try {
      await onSave(normalized, normalizedDiscouraged);
      setDirtySinceSave(false);
      setSaveTick((tick) => tick + 1);
      onSaveSuccess?.();
    } finally {
      setIsSaving(false);
    }
  };

  const selectedBlockCount = React.useMemo(
    () =>
      dates.reduce(
        (total, date) =>
          total +
          chunks.filter((chunk) =>
            chunk.some(
              (minute) =>
                (!enabledSlots ||
                  enabledSlots.has(makeSlotKey(date, minute))) &&
                selectedSlots.has(makeSlotKey(date, minute)),
            ),
          ).length,
        0,
      ),
    [chunks, dates, enabledSlots, selectedSlots],
  );

  const changeParticipation = async (action?: () => Promise<void>) => {
    if (!action) return;
    setParticipationSaving(true);
    try {
      await action();
      restoreOptOutFocusRef.current = true;
      setConfirmOptOut(false);
    } catch {
      // The parent mutation owns the visible error state.
    } finally {
      setParticipationSaving(false);
    }
  };

  if (participation === "not_participating") {
    return (
      <SchedulePanel
        dataCy={stage ? "schedule-stage" : undefined}
        stage={stage}
      >
        {foundationNav}
        <SchedulePanelBody className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-surface-muted text-text-muted">
              <UserMinus size={iconSizes.standard} aria-hidden="true" />
            </span>
            <div>
              <h2 className="m-0 text-sm font-bold text-text-primary">
                Du deltar ikke i intervjuene
              </h2>
              <p className="m-0 mt-0.5 text-detail text-text-muted">
                Du trenger ikke sende inn tilgjengelighet.
              </p>
            </div>
          </div>
          <button
            ref={rejoinButtonRef}
            type="button"
            disabled={participationSaving || !onRejoin}
            onClick={() => void changeParticipation(onRejoin)}
            className={actionButtonBase + " " + actionButtonNeutral}
          >
            Jeg skal delta
          </button>
        </SchedulePanelBody>
      </SchedulePanel>
    );
  }
  return (
    <SchedulePanel
      dataCy={stage ? "schedule-stage" : undefined}
      stage={stage}
      className="select-none !overflow-visible"
    >
      {foundationNav}
      <SchedulePanelHeader
        icon={CalendarRange}
        title="Når kan du intervjue?"
        description="Velg hele intervjublokker, eller juster enkelttider."
        actions={
          <div className="flex flex-wrap gap-1.5">
            <ScheduleGridLegendItem
              label="Valgt"
              swatchClassName="border-border bg-surface-base"
              swatchStyle={scheduleOpenLegendStyle}
            />
            {supportsDiscouraged && (
              <ScheduleGridLegendItem
                label="Helst ikke"
                swatchClassName="border-dashed border-warning-border bg-warning-bg"
              />
            )}
            <ScheduleGridLegendItem
              label="Ikke valgt"
              swatchClassName="border-border-soft bg-surface-neutral"
            />
            <ScheduleGridLegendItem
              label="Utilgjengelig"
              swatchClassName="border-border-soft bg-surface-muted [background-image:repeating-linear-gradient(135deg,var(--color-border-muted)_0_5px,transparent_5px_11px,var(--color-border-muted)_11px_15px,transparent_15px_21px)] [background-size:16px_16px]"
            />
          </div>
        }
      />
      <SchedulePanelBody>
        {supportsDiscouraged && (
          <div
            data-cy="availability-paint-mode"
            className="mb-4 rounded-md border border-border-soft bg-surface-subtle px-3 py-2"
          >
            <p className="m-0 text-detail text-text-muted">
              Marker tidene du kan. Bruk <strong>Helst ikke</strong> for tider
              du kan møte, men helst vil slippe — for eksempel en forelesning.
              Lar du en tid stå umarkert, betyr det at du ikke kan.
            </p>
            <div
              role="radiogroup"
              aria-label="Hva markeringen betyr"
              className="mt-2 flex flex-wrap gap-1.5"
            >
              {(
                [
                  ["available", "Kan"],
                  ["discouraged", "Helst ikke"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={paintMode === mode}
                  data-cy={`paint-mode-${mode}`}
                  onClick={() => setPaintMode(mode)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-detail font-semibold",
                    keyboardFocusRingClass,
                    paintMode === mode
                      ? "border-brand-activeBorder bg-brand-soft text-text-primary"
                      : "border-border-soft bg-surface-base text-text-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <SelectableScheduleGrid
          dates={dates}
          chunks={chunks}
          sessionDuration={sessionDuration}
          selectableSlots={enabledSlots}
          activeSlots={supportsDiscouraged ? gridActiveSlots : selectedSlots}
          secondarySlots={supportsDiscouraged ? discouraged : undefined}
          secondaryLabel={supportsDiscouraged ? "helst ikke" : undefined}
          onChangeActiveSlots={handleGridChange}
          labels={{
            grid: "Min tilgjengelighet per intervjublokk",
            unavailableCell: "Stengt",
            cell: ({ date, startMinute, endMinute }) => {
              const { weekday, dayMonth } = formatDateHeader(date);
              return `${weekday} ${dayMonth} ${formatMinutes(
                startMinute,
              )}–${formatMinutes(endMinute)}`;
            },
          }}
        />
        {extraSection && (
          <div className="mt-4 border-t border-border-soft pt-4">
            {extraSection}
          </div>
        )}
      </SchedulePanelBody>

      {/* The panel runs !overflow-visible (the grid needs to escape it), so it
          cannot clip this corner for us. */}
      <SchedulePanelFooter className="rounded-b-panel bg-surface-base">
        <div className="flex flex-wrap items-center gap-5">
          <MetaValue label="Intervjublokker" value={selectedBlockCount} />
          <MetaValue label="Intervjutider" value={selectedSlots.size} />
        </div>
        <div className="flex items-center gap-3">
          {onOptOut && !confirmOptOut && (
            <button
              ref={optOutTriggerRef}
              type="button"
              onClick={() => setConfirmOptOut(true)}
              className={`${keyboardFocusRingClass} text-detail font-semibold text-text-muted underline-offset-2 hover:text-text-primary hover:underline`}
            >
              Jeg deltar ikke
            </button>
          )}
          {confirmOptOut && (
            <span className="flex flex-wrap items-center justify-end gap-2 text-detail text-text-muted">
              <span>
                {affectedAssignmentCount > 0
                  ? `${affectedAssignmentCount} planlagte intervju må repareres.`
                  : "Du fjernes fra planleggingen."}
              </span>
              <button
                ref={optOutCancelRef}
                type="button"
                onClick={() => {
                  restoreOptOutFocusRef.current = true;
                  setConfirmOptOut(false);
                }}
                className={`${keyboardFocusRingClass} font-semibold hover:underline`}
              >
                Avbryt
              </button>
              <button
                type="button"
                disabled={participationSaving}
                onClick={() => void changeParticipation(onOptOut)}
                className={`${keyboardFocusRingClass} font-semibold text-danger hover:underline disabled:opacity-50`}
              >
                Bekreft
              </button>
            </span>
          )}
          {hasUnsavedWork && (
            <span className="text-detail font-semibold text-text-muted">
              Ulagrede endringer
            </span>
          )}
          <SaveButton
            isSaving={isSaving}
            saveTick={saveTick}
            onClick={handleSave}
            disabled={!onSave}
          >
            Lagre tilgjengelighet
          </SaveButton>
        </div>
      </SchedulePanelFooter>
    </SchedulePanel>
  );
};

export default TimeScheduler;
