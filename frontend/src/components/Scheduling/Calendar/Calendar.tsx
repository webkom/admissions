import * as React from "react";
import { formatDateHeader, makeSlotKey } from "../scheduleUtils";
import cn from "src/utils/cn";

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
  const [dirtySinceSave, setDirtySinceSave] = React.useState(false);

  const timeSlots = React.useMemo(() => {
    const slots = [];
    const step = sessionDuration > 0 ? sessionDuration : 60;
    let currentMinute = dayStartMinute;
    while (currentMinute < dayEndMinute) {
      for (let i = 0; i < chunkSize && currentMinute < dayEndMinute; i++) {
        slots.push(currentMinute);
        currentMinute += step;
      }
      currentMinute += chunkBreakMinutes;
    }
    return slots;
  }, [
    dayStartMinute,
    dayEndMinute,
    sessionDuration,
    chunkSize,
    chunkBreakMinutes,
  ]);

  const chunks = React.useMemo(() => {
    const res = [];
    for (let i = 0; i < timeSlots.length; i += chunkSize) {
      res.push(timeSlots.slice(i, i + chunkSize));
    }
    return res;
  }, [timeSlots, chunkSize]);

  const formatTime = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, "0")}`;
  };

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

  const handleMouseDown = (date: string, chunk: number[]) => {
    if (!chunk.some((m) => isSlotEnabled(date, m))) return;

    const enabledInChunk = chunk.filter((m) => isSlotEnabled(date, m));
    const selectedInChunk = enabledInChunk.filter((m) =>
      selectedSlots.has(makeSlotKey(date, m)),
    );
    const newAddMode = selectedInChunk.length < enabledInChunk.length;

    setAddMode(newAddMode);
    setIsDragging(true);
    toggleChunk(date, chunk, newAddMode, selectedSlots);
  };

  const handleMouseEnter = (date: string, chunk: number[]) => {
    if (isDragging && chunk.some((m) => isSlotEnabled(date, m))) {
      toggleChunk(date, chunk, addMode, selectedSlots);
    }
  };

  const handleMouseUp = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(selectedSlots);
      setDirtySinceSave(false);
      onSaveSuccess?.();
    } finally {
      setIsSaving(false);
    }
  };

  const columns = dates.length + 1;

  return (
    <div
      className={cn(
        "rounded-panel border border-border bg-surface-base",
        "flex min-w-0 flex-col gap-4 p-5 select-none",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-sm font-bold text-text-primary">
          Marker ledighet
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <LegendItem label="Valgt" variant="selected" />
          <LegendItem label="Ledig" variant="open" />
          <LegendItem label="Stengt" variant="disabled" />
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-surface-muted p-3">
        <div
          className="grid gap-[5px]"
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
                  "flex min-h-9 items-center justify-center rounded-md border border-border bg-surface-base text-label font-bold uppercase tracking-label text-text-muted",
                  "flex-col gap-[0.1rem]",
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
                <div className="text-label font-bold uppercase tracking-label text-border-quiet">
                  {formatTime(chunk[0])}
                </div>
                {chunk.length > 1 && (
                  <div className="text-[10px] font-medium leading-none text-text-disabled">
                    til {formatTime(chunk[chunk.length - 1] + sessionDuration)}
                  </div>
                )}
              </div>

              {dates.map((date) => {
                const enabledInChunk = chunk.filter((m) =>
                  isSlotEnabled(date, m),
                );
                const selectedInChunk = enabledInChunk.filter((m) =>
                  selectedSlots.has(makeSlotKey(date, m)),
                );

                const isAllSelected =
                  enabledInChunk.length > 0 &&
                  selectedInChunk.length === enabledInChunk.length;
                const isSomeSelected = selectedInChunk.length > 0;
                const isAnyEnabled = enabledInChunk.length > 0;

                return (
                  <div
                    key={`${date}-${chunkIdx}`}
                    onMouseDown={() => handleMouseDown(date, chunk)}
                    onMouseEnter={() => handleMouseEnter(date, chunk)}
                    className={cn(
                      "group relative flex min-h-[44px] w-full flex-col gap-[2px] rounded-md border p-1 transition-all duration-100",
                      !isAnyEnabled &&
                        "cursor-not-allowed border-border bg-surface-neutral",
                      isAnyEnabled &&
                        isAllSelected &&
                        "cursor-pointer border-brand bg-brand hover:bg-brand-hover",
                      isAnyEnabled &&
                        !isAllSelected &&
                        isSomeSelected &&
                        "cursor-pointer border-brand-strongBorder bg-brand-soft hover:bg-brand-muted",
                      isAnyEnabled &&
                        !isSomeSelected &&
                        "cursor-pointer border-border bg-surface-base hover:border-brand-strongBorder hover:bg-brand-soft",
                    )}
                  >
                    <div className="flex flex-1 flex-wrap gap-[2px]">
                      {chunk.map((m) => {
                        const enabled = isSlotEnabled(date, m);
                        const selected = selectedSlots.has(
                          makeSlotKey(date, m),
                        );
                        return (
                          <div
                            key={m}
                            className={cn(
                              "h-1.5 flex-1 rounded-[1px]",
                              !enabled && "bg-border-muted/30",
                              enabled &&
                                selected &&
                                (isAllSelected ? "bg-white/40" : "bg-brand"),
                              enabled && !selected && "bg-border-faint",
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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <FooterInfo label="Valgte slots" value={String(selectedSlots.size)} />
        <FooterInfo label="Intervjulengde" value={`${sessionDuration} min`} />
        <div className="flex items-center gap-3">
          {dirtySinceSave && (
            <span className="text-xs font-semibold italic text-text-faded">
              Ulagrede endringer
            </span>
          )}
          <button
            className="cursor-pointer rounded-lg border border-brand bg-brand px-4 py-2 text-ui font-bold text-white transition-[background,border-color,box-shadow] duration-150 hover:border-brand-hover hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ring active:bg-brand-pressed disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleSave}
            disabled={isSaving || !onSave}
            type="button"
          >
            {isSaving ? "Lagrer..." : "Lagre tilgjengelighet"}
          </button>
        </div>
      </div>
    </div>
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
        "h-[7px] w-[7px] shrink-0 rounded-full",
        variant === "selected" && "bg-brand",
        variant === "open" && "border border-border-quiet bg-surface-base",
        variant === "disabled" && "bg-border",
      )}
    />
    {label}
  </span>
);

interface FooterInfoProps {
  label: string;
  value: string;
}

const FooterInfo = ({ label, value }: FooterInfoProps) => (
  <div className="flex items-baseline gap-2">
    <span className="text-label font-bold uppercase tracking-label text-text-subtle">
      {label}
    </span>
    <strong className="text-sm font-bold text-text-primary">{value}</strong>
  </div>
);

export default TimeScheduler;
