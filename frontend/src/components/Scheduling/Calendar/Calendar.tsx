import * as React from "react";
import { CalendarRange, Check } from "lucide-react";
import {
  buildBlockTimeChunks,
  formatDateHeader,
  formatMinutes,
  makeSlotKey,
} from "../scheduleUtils";
import cn from "src/utils/cn";
import { iconSizes, iconStrokeWidths } from "src/styles/designTokens";
import {
  SchedulePanel,
  SchedulePanelHeader,
  SchedulePanelBody,
  SchedulePanelFooter,
  MetaValue,
  SaveButton,
} from "../ui";
import ScheduleGridFrame, {
  ScheduleDayHeader,
  ScheduleGridLegendItem,
  ScheduleBlockCell,
  ScheduleSlotSegments,
  ScheduleTimeLabel,
} from "./ScheduleGridFrame";

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
}) => {
  const [internalSelectedSlots, setInternalSelectedSlots] = React.useState<
    Set<string>
  >(new Set());
  const selectedSlots = externalSelectedSlots ?? internalSelectedSlots;
  const setSelectedSlots = onSlotsChange ?? setInternalSelectedSlots;

  const [isDragging, setIsDragging] = React.useState(false);
  const [addMode, setAddMode] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveTick, setSaveTick] = React.useState(0);
  const [dirtySinceSave, setDirtySinceSave] = React.useState(false);

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

  const toggleChunk = React.useCallback(
    (
      date: string,
      chunk: number[],
      mode: boolean,
      currentSlots: Set<string>,
    ) => {
      const next = new Set(currentSlots);
      chunk.forEach((minute) => {
        if (!enabledSlots || !enabledSlots.has(makeSlotKey(date, minute)))
          return;
        const slotId = makeSlotKey(date, minute);
        if (mode) next.add(slotId);
        else next.delete(slotId);
      });
      setSelectedSlots(next);
      setDirtySinceSave(true);
    },
    [enabledSlots, setSelectedSlots],
  );

  const blockAddMode = (date: string, chunk: number[]) => {
    const enabledInChunk = chunk.filter((m) => isSlotEnabled(date, m));
    return !enabledInChunk.some((m) => selectedSlots.has(makeSlotKey(date, m)));
  };

  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    date: string,
    chunk: number[],
  ) => {
    if (!chunk.some((m) => isSlotEnabled(date, m))) return;

    // Touch pointers capture implicitly on pointerdown; release so cells
    // under the moving finger receive pointerenter during the drag.
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const newAddMode = blockAddMode(date, chunk);
    setAddMode(newAddMode);
    setIsDragging(true);
    toggleChunk(date, chunk, newAddMode, selectedSlots);
  };

  const handlePointerEnter = (date: string, chunk: number[]) => {
    if (isDragging && chunk.some((m) => isSlotEnabled(date, m))) {
      toggleChunk(date, chunk, addMode, selectedSlots);
    }
  };

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    date: string,
    chunk: number[],
  ) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (!chunk.some((m) => isSlotEnabled(date, m))) return;
    toggleChunk(date, chunk, blockAddMode(date, chunk), selectedSlots);
  };

  const handlePointerUp = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [handlePointerUp]);

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
  return (
    <SchedulePanel className="select-none !overflow-visible">
      <SchedulePanelHeader
        icon={CalendarRange}
        title="Når kan du intervjue?"
        description="Velg hele intervjublokker. Hver blokk viser de enkelte intervjutidene som små streker."
        actions={
          <div className="flex flex-wrap gap-1.5">
            <ScheduleGridLegendItem
              label="Valgt"
              swatchClassName="border-brand-activeBorder bg-brand-tint"
            />
            <ScheduleGridLegendItem
              label="Ledig"
              swatchClassName="border-border bg-surface-base"
            />
            <ScheduleGridLegendItem
              label="Stengt"
              swatchClassName="border-border-soft bg-surface-neutral [background-image:var(--pattern-unavailable)]"
            />
          </div>
        }
      />

      <SchedulePanelBody>
        <ScheduleGridFrame dates={dates}>
          <div />

          {dates.map((date) => (
            <ScheduleDayHeader key={date} date={date} />
          ))}

          {chunks.map((chunk, chunkIdx) => (
            <React.Fragment key={chunkIdx}>
              <ScheduleTimeLabel
                startMinute={chunk[0]}
                endMinute={chunk[chunk.length - 1] + sessionDuration}
                showEnd={chunk.length > 1}
              />

              {dates.map((date) => {
                const enabledInChunk = chunk.filter((m) =>
                  isSlotEnabled(date, m),
                );
                const isAnyEnabled = enabledInChunk.length > 0;
                const isSelected =
                  isAnyEnabled &&
                  enabledInChunk.some((m) =>
                    selectedSlots.has(makeSlotKey(date, m)),
                  );
                const { weekday, dayMonth } = formatDateHeader(date);
                const cellLabel = `${weekday} ${dayMonth} ${formatMinutes(
                  chunk[0],
                )}–${formatMinutes(chunk[chunk.length - 1] + sessionDuration)}`;

                return (
                  <ScheduleBlockCell
                    key={`${date}-${chunkIdx}`}
                    role="button"
                    tabIndex={isAnyEnabled ? 0 : -1}
                    aria-pressed={isSelected}
                    aria-disabled={!isAnyEnabled}
                    aria-label={isAnyEnabled ? cellLabel : "Stengt"}
                    onPointerDown={(e) => handlePointerDown(e, date, chunk)}
                    onPointerEnter={() => handlePointerEnter(date, chunk)}
                    onKeyDown={(e) => handleCellKeyDown(e, date, chunk)}
                    closed={!isAnyEnabled}
                    className={cn(
                      isAnyEnabled &&
                        isSelected &&
                        "cursor-pointer border-brand-activeBorder bg-brand-tint text-brand ring-1 ring-inset ring-brand-border hover:bg-brand-fill",
                      isAnyEnabled &&
                        !isSelected &&
                        "cursor-pointer border-border bg-surface-base hover:border-brand-strongBorder hover:bg-brand-soft",
                    )}
                  >
                    <ScheduleSlotSegments
                      closed={!isAnyEnabled}
                      fills={chunk.map((minute) =>
                        isSlotEnabled(date, minute) && isSelected ? 1 : 0,
                      )}
                    />
                    {isSelected && (
                      <Check
                        size={iconSizes.compact}
                        strokeWidth={iconStrokeWidths.strong}
                        className="text-brand-dark"
                      />
                    )}
                  </ScheduleBlockCell>
                );
              })}
            </React.Fragment>
          ))}
        </ScheduleGridFrame>
      </SchedulePanelBody>

      <SchedulePanelFooter className="sticky bottom-0 z-20 bg-surface-base">
        <div className="flex flex-wrap items-center gap-5">
          <MetaValue label="Intervjublokker" value={selectedBlockCount} />
          <MetaValue label="Intervjutider" value={selectedSlots.size} />
        </div>
        <div className="flex items-center gap-3">
          {dirtySinceSave && (
            <span className="text-detail font-semibold italic text-text-faded">
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
