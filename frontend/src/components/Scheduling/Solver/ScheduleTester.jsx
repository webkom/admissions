import React, { useState, useCallback, useEffect, Fragment } from "react";
import cn from "src/utils/cn";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ScheduleTester({
  selectedSlots: externalSelectedSlots,
  onSlotsChange,
  startHour = 8,
  endHour = 18,
  title,
}) {
  const [internalSelectedSlots, setInternalSelectedSlots] = useState(
    new Set(),
  );
  const selectedSlots = externalSelectedSlots ?? internalSelectedSlots;
  const setSelectedSlots = onSlotsChange ?? setInternalSelectedSlots;

  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState("select");
  const [dragStart, setDragStart] = useState(null);
  const [previewSlots, setPreviewSlots] = useState(new Set());

  const hours = Array.from({ length: endHour - startHour }, (_, i) => i + startHour);
  const slotKey = (day, hour) => `${day}-${hour}`;

  const getSlotsInRange = (start, end) => {
    const slots = new Set();
    const minDay = Math.min(start.day, end.day);
    const maxDay = Math.max(start.day, end.day);
    const minHour = Math.min(start.hour, end.hour);
    const maxHour = Math.max(start.hour, end.hour);

    for (let d = minDay; d <= maxDay; d += 1) {
      for (let h = minHour; h <= maxHour; h += 1) {
        slots.add(slotKey(d, h));
      }
    }

    return slots;
  };

  const handleMouseDown = (day, hour) => {
    const key = slotKey(day, hour);
    const isSelected = selectedSlots.has(key);
    setIsDragging(true);
    setDragMode(isSelected ? "deselect" : "select");
    setDragStart({ day, hour });
    setPreviewSlots(new Set([key]));
  };

  const handleMouseEnter = (day, hour) => {
    if (!isDragging || !dragStart) return;
    setPreviewSlots(getSlotsInRange(dragStart, { day, hour }));
  };

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    const newSet = new Set(selectedSlots);
    previewSlots.forEach((slot) => {
      if (dragMode === "select") newSet.add(slot);
      else newSet.delete(slot);
    });
    setSelectedSlots(newSet);
    setIsDragging(false);
    setDragStart(null);
    setPreviewSlots(new Set());
  }, [dragMode, isDragging, previewSlots, selectedSlots, setSelectedSlots]);

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  const formatHour = (hour) => {
    const period = hour >= 12 ? "pm" : "am";
    const displayHour = hour % 12 || 12;
    return `${displayHour}${period}`;
  };

  return (
    <div className="overflow-hidden rounded-panel border border-border bg-surface-base select-none">
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        {title ? (
          <h2 className="m-0 text-sm font-bold text-text-primary">{title}</h2>
        ) : (
          <div />
        )}

        <div className="flex gap-2">
          <button
            type="button"
            className="cursor-pointer rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.05em] text-text-subtle transition-colors duration-100 hover:text-text-primary"
            onClick={() => setSelectedSlots(new Set())}
          >
            Tøm
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-md bg-surface-neutral px-2 py-1 text-[10px] font-bold uppercase tracking-[0.05em] text-text-muted transition-colors duration-100 hover:bg-border-muted hover:text-text-primary"
            onClick={() => {
              const workSlots = new Set();
              for (let d = 0; d < 5; d += 1) {
                for (let h = 9; h < 17; h += 1) {
                  if (h >= startHour && h < endHour) workSlots.add(slotKey(d, h));
                }
              }
              setSelectedSlots(workSlots);
            }}
          >
            Mandag - Fredag
          </button>
        </div>
      </div>

      <div className="overflow-x-auto p-4">
        <div className="inline-grid min-w-full grid-cols-[40px_repeat(7,minmax(40px,1fr))] gap-px rounded-[var(--border-radius-sm)] border border-surface-neutral bg-surface-neutral">
          <div />

          {DAYS.map((day) => (
            <div
              key={day}
              className="bg-surface-base py-2 text-center text-[10px] font-bold uppercase text-text-subtle"
            >
              {day}
            </div>
          ))}

          {hours.map((hour) => (
            <Fragment key={hour}>
              <div className="flex items-center justify-end bg-surface-base px-2 py-1 text-[10px] font-mono text-text-faded">
                {formatHour(hour)}
              </div>
              {DAYS.map((_, dayIndex) => {
                const key = slotKey(dayIndex, hour);
                const isSelected = selectedSlots.has(key);
                const isPreview = previewSlots.has(key);

                return (
                  <div
                    key={key}
                    onMouseDown={() => handleMouseDown(dayIndex, hour)}
                    onMouseEnter={() => handleMouseEnter(dayIndex, hour)}
                    className={cn(
                      "h-8 cursor-pointer bg-surface-base transition-colors duration-75",
                      isSelected && "bg-text-primary",
                      isPreview &&
                        dragMode === "select" &&
                        "bg-border-muted",
                      isPreview &&
                        dragMode === "deselect" &&
                        "bg-brand-soft",
                      !isSelected &&
                        !isPreview &&
                        "hover:bg-surface-subtle",
                    )}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ScheduleTester;
