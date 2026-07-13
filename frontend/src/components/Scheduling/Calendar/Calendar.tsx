import * as React from "react";
import { CalendarRange } from "lucide-react";
import {
  buildBlockTimeChunks,
  formatDateHeader,
  formatMinutes,
  makeSlotKey,
} from "../scheduleUtils";
import cn from "src/utils/cn";
import {
  SchedulePanel,
  SchedulePanelHeader,
  SchedulePanelBody,
  SchedulePanelFooter,
  MetaValue,
  SaveButton,
} from "../ui";

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

  const columns = dates.length + 1;

  return (
    <SchedulePanel className="select-none">
      <SchedulePanelHeader
        icon={CalendarRange}
        title="Når kan du intervjue? Velg flest mulig!"
        description="Klikk og dra. Grå ruter er stengt."
        actions={
          <div className="flex flex-wrap gap-1.5">
            <LegendItem label="Valgt" variant="selected" />
            <LegendItem label="Ledig" variant="open" />
            <LegendItem label="Stengt" variant="disabled" />
          </div>
        }
      />

      <SchedulePanelBody>
        <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-surface-muted p-3">
          <div
            className="grid touch-auto gap-1"
            style={{
              gridTemplateColumns: `56px repeat(${columns - 1}, minmax(70px, 1fr))`,
              minWidth: `max(680px, ${(columns - 1) * 70 + 56}px)`,
            }}
          >
            <div />

            {dates.map((date) => {
              const { weekday, dayMonth } = formatDateHeader(date);
              return (
                <div
                  key={date}
                  className={cn(
                    "flex min-h-9 items-center justify-center rounded-md border border-border bg-surface-base text-detail font-semibold text-text-muted",
                    "flex-col gap-0.5",
                  )}
                >
                  <span>{weekday}</span>
                  <span className="block text-label font-semibold text-text-subtle">
                    {dayMonth}
                  </span>
                </div>
              );
            })}

            {chunks.map((chunk, chunkIdx) => (
              <React.Fragment key={chunkIdx}>
                <div className="flex flex-col items-end justify-center pr-2">
                  <div className="text-label font-semibold tabular-nums text-text-subtle">
                    {formatMinutes(chunk[0])}
                  </div>
                  {chunk.length > 1 && (
                    <div className="text-nano font-medium leading-none tabular-nums text-text-disabled">
                      til{" "}
                      {formatMinutes(chunk[chunk.length - 1] + sessionDuration)}
                    </div>
                  )}
                </div>

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
                    <div
                      key={`${date}-${chunkIdx}`}
                      role="button"
                      tabIndex={isAnyEnabled ? 0 : -1}
                      aria-pressed={isSelected}
                      aria-disabled={!isAnyEnabled}
                      aria-label={cellLabel}
                      onPointerDown={(e) => handlePointerDown(e, date, chunk)}
                      onPointerEnter={() => handlePointerEnter(date, chunk)}
                      onKeyDown={(e) => handleCellKeyDown(e, date, chunk)}
                      className={cn(
                        "group relative flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-md border p-1.5 transition-all duration-100",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
                        !isAnyEnabled &&
                          "cursor-not-allowed border-border-soft bg-surface-neutral [background-image:var(--pattern-unavailable)]",
                        isAnyEnabled &&
                          isSelected &&
                          "cursor-pointer border-brand bg-brand hover:bg-brand-hover",
                        isAnyEnabled &&
                          !isSelected &&
                          "cursor-pointer border-border bg-surface-base hover:border-brand-strong hover:bg-brand-soft",
                      )}
                    >
                      <div className="flex h-1.5 w-full items-center gap-1">
                        {chunk.map((m) => {
                          const enabled = isSlotEnabled(date, m);
                          return (
                            <div
                              key={m}
                              className={cn(
                                "h-full flex-1 rounded-full",
                                !enabled
                                  ? "bg-border-muted/30"
                                  : isSelected
                                    ? "bg-white/55"
                                    : "bg-border-faint",
                              )}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </SchedulePanelBody>

      <SchedulePanelFooter>
        <div className="flex flex-wrap items-center gap-5">
          <MetaValue label="Valgte tider" value={selectedSlots.size} />
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

interface LegendItemProps {
  label: string;
  variant: "selected" | "open" | "disabled";
}

const LegendItem = ({ label, variant }: LegendItemProps) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-2.5 py-1 text-xs font-semibold text-text-muted">
    <span
      className={cn(
        "h-2.5 w-2.5 shrink-0 rounded-sm border",
        variant === "selected" && "border-brand bg-brand",
        variant === "open" && "border-border-quiet bg-surface-base",
        variant === "disabled" &&
          "border-border-soft bg-surface-neutral [background-image:var(--pattern-unavailable)]",
      )}
    />
    {label}
  </span>
);

export default TimeScheduler;
