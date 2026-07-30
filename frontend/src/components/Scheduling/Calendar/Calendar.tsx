import * as React from "react";
import { CalendarRange, UserMinus } from "lucide-react";
import { iconSizes } from "src/styles/designTokens";
import type { InterviewerParticipation } from "src/types";
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
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  onSave?: (slots: Set<string>) => Promise<void>;
  onSaveSuccess?: () => void;
  sessionDuration: number;
  dates: string[];
  participation?: InterviewerParticipation;
  affectedAssignmentCount?: number;
  onOptOut?: () => Promise<void>;
  onRejoin?: () => Promise<void>;
  stage?: string;
  foundationNav?: React.ReactNode;
}

const TimeScheduler: React.FC<TimeSchedulerProps> = ({
  enabledSlots,
  selectedSlots: externalSelectedSlots,
  onSlotsChange,
  dayStartMinute,
  dayEndMinute,
  chunkSize,
  chunkBreakMinutes,
  onSave,
  onSaveSuccess,
  sessionDuration,
  dates,
  participation,
  affectedAssignmentCount = 0,
  onOptOut,
  onRejoin,
  stage,
  foundationNav,
}) => {
  const [internalSelectedSlots, setInternalSelectedSlots] = React.useState<
    Set<string>
  >(new Set());
  const selectedSlots = externalSelectedSlots ?? internalSelectedSlots;
  const setSelectedSlots = onSlotsChange ?? setInternalSelectedSlots;

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
      setSelectedSlots(nextSlots);
      setDirtySinceSave(true);
    },
    [setSelectedSlots],
  );

  React.useEffect(() => {
    if (!dirtySinceSave) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirtySinceSave]);

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
    setIsSaving(true);
    try {
      await onSave(normalized);
      setDirtySinceSave(false);
      setSaveTick((tick) => tick + 1);
      onSaveSuccess?.();
    } catch {
      // The owning mutation reports the error. Keep this editor dirty so the
      // user can retry without also leaking a rejected event-handler promise.
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
        description="Velg hele intervjublokker. Hver blokk viser de enkelte intervjutidene som små streker."
        actions={
          <div className="flex flex-wrap gap-1.5">
            <ScheduleGridLegendItem
              label="Valgt"
              swatchClassName="border-border bg-surface-base"
              swatchStyle={scheduleOpenLegendStyle}
            />
            <ScheduleGridLegendItem
              label="Ikke valgt"
              swatchClassName="border-border-soft bg-surface-neutral [background-image:var(--pattern-unavailable)]"
            />
            <ScheduleGridLegendItem
              label="Utilgjengelig"
              swatchClassName="border-border-soft bg-surface-neutral opacity-55 [background-image:var(--pattern-unavailable)]"
            />
          </div>
        }
      />
      <SchedulePanelBody>
        <SelectableScheduleGrid
          dates={dates}
          chunks={chunks}
          sessionDuration={sessionDuration}
          selectableSlots={enabledSlots}
          activeSlots={selectedSlots}
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
      </SchedulePanelBody>

      <SchedulePanelFooter className="sticky bottom-0 z-20 bg-surface-base">
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
          {dirtySinceSave && (
            <span className="text-detail font-semibold text-text-muted">
              Endringer klare til lagring
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
