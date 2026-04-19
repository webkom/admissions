import * as React from "react";
import { formatDateHeader, makeSlotKey } from "../scheduleUtils";
import cn from "src/utils/cn";

interface TimeSchedulerProps {
  enabledSlots?: Set<string>;
  selectedSlots?: Set<string>;
  onSlotsChange?: (slots: Set<string>) => void;
  startHour?: number;
  endHour?: number;
  onSave?: (slots: Set<string>) => Promise<void>;
  sessionDuration: number;
  dates: string[];
}

const TimeScheduler: React.FC<TimeSchedulerProps> = ({
  enabledSlots,
  selectedSlots: externalSelectedSlots,
  onSlotsChange,
  startHour = 8,
  endHour = 18,
  onSave,
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

  const startMinute = startHour * 60;
  const endMinute = endHour * 60;

  const timeSlots = React.useMemo(() => {
    const slots = [];
    const step = sessionDuration > 0 ? sessionDuration : 60;
    for (let m = startMinute; m < endMinute; m += step) {
      slots.push(m);
    }
    return slots;
  }, [startMinute, endMinute, sessionDuration]);

  const formatTime = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, "0")}`;
  };

  const isSlotEnabled = (date: string, minute: number): boolean => {
    if (!enabledSlots) return true;
    return enabledSlots.has(makeSlotKey(date, minute));
  };

  const toggleSlot = React.useCallback(
    (date: string, minute: number, mode: boolean, currentSlots: Set<string>) => {
      if (!enabledSlots || !enabledSlots.has(makeSlotKey(date, minute))) return;

      const slotId = makeSlotKey(date, minute);
      const next = new Set(currentSlots);
      if (mode) next.add(slotId);
      else next.delete(slotId);
      setSelectedSlots(next);
    },
    [enabledSlots, setSelectedSlots],
  );

  const handleMouseDown = (date: string, minute: number) => {
    if (!isSlotEnabled(date, minute)) return;
    const slotId = makeSlotKey(date, minute);
    const newAddMode = !selectedSlots.has(slotId);
    setAddMode(newAddMode);
    setIsDragging(true);
    toggleSlot(date, minute, newAddMode, selectedSlots);
  };

  const handleMouseEnter = (date: string, minute: number) => {
    if (isDragging && isSlotEnabled(date, minute)) {
      toggleSlot(date, minute, addMode, selectedSlots);
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
          Marker tilgjengelige slots
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

          {timeSlots.map((minute) => (
            <React.Fragment key={minute}>
              <div className="flex items-center justify-end pr-2 text-label font-bold uppercase tracking-label text-border-quiet">
                {formatTime(minute)}
              </div>

              {dates.map((date) => {
                const enabled = isSlotEnabled(date, minute);
                const isSelected = selectedSlots.has(makeSlotKey(date, minute));

                return (
                  <div
                    key={makeSlotKey(date, minute)}
                    onMouseDown={() => handleMouseDown(date, minute)}
                    onMouseEnter={() => handleMouseEnter(date, minute)}
                    className={cn(
                      "h-10 w-full rounded-md border transition-[background-color,border-color] duration-100",
                      !enabled && "cursor-not-allowed border-border bg-surface-neutral",
                      enabled && isSelected && "cursor-pointer border-brand bg-brand hover:bg-brand-hover",
                      enabled &&
                        !isSelected &&
                        "cursor-pointer border-border bg-surface-base hover:border-brand-strongBorder hover:bg-brand-soft",
                    )}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <FooterInfo label="Valgte slots" value={String(selectedSlots.size)} />
        <FooterInfo label="Intervjulengde" value={`${sessionDuration} min`} />
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
