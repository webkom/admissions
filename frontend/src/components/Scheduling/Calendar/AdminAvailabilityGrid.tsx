import React from "react";
import { Check } from "lucide-react";
import cn from "src/utils/cn";
import { iconSizes, iconStrokeWidths } from "src/styles/designTokens";
import { actionButtonBase, actionButtonGhost } from "../ui";
import { formatDateHeader, formatMinutes, makeSlotKey } from "../scheduleUtils";
import { useAvailabilityGridInteractions } from "./useAvailabilityGridInteractions";
import ScheduleGridFrame, {
  ScheduleDayHeader,
  ScheduleGridLegendItem,
  ScheduleBlockCell,
  ScheduleSlotSegments,
  ScheduleTimeLabel,
} from "./ScheduleGridFrame";

interface AdminAvailabilityGridProps {
  dates: string[];
  timeSlots: number[];
  chunks: number[][];
  enabledSlots: ReadonlySet<string>;
  sessionDuration: number;
  totalInterviewSlotCount: number;
  onChangeSlots: (slots: Set<string>) => void;
}

const AdminAvailabilityGrid: React.FC<AdminAvailabilityGridProps> = ({
  dates,
  timeSlots,
  chunks,
  enabledSlots,
  sessionDuration,
  totalInterviewSlotCount,
  onChangeSlots,
}) => {
  const {
    clearAll,
    clearAllForDay,
    handleCellKeyDown,
    handlePointerDown,
    handlePointerEnter,
    selectAll,
    selectAllForDay,
  } = useAvailabilityGridInteractions({
    dates,
    selectedSlots: enabledSlots,
    timeSlots,
    onChangeSlots,
  });

  return (
    <section className="border-t border-border-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 handheld:px-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ScheduleGridLegendItem
            label="Åpen for intervju"
            swatchClassName="border-brand-activeBorder bg-brand-tint"
          />
          <ScheduleGridLegendItem
            label="Stengt"
            swatchClassName="border-border-soft bg-surface-neutral [background-image:var(--pattern-unavailable)]"
          />
          {totalInterviewSlotCount > 0 && (
            <span className="text-detail font-medium tabular-nums text-text-muted">
              {totalInterviewSlotCount} mulige intervjutider
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={cn(actionButtonBase, actionButtonGhost, "px-3 py-1.5")}
            onClick={selectAll}
          >
            Velg alle
          </button>
          <button
            type="button"
            className={cn(actionButtonBase, actionButtonGhost, "px-3 py-1.5")}
            onClick={clearAll}
          >
            Tøm alle
          </button>
        </div>
      </div>
      <div className="select-none px-5 pb-5 handheld:px-4 handheld:pb-4">
        <ScheduleGridFrame dates={dates}>
          <div />
          {dates.map((date) => {
            const { weekday, dayMonth } = formatDateHeader(date);
            const isAllSelected =
              timeSlots.length > 0 &&
              timeSlots.every((minute) =>
                enabledSlots.has(makeSlotKey(date, minute)),
              );
            const isSomeSelected = timeSlots.some((minute) =>
              enabledSlots.has(makeSlotKey(date, minute)),
            );

            return (
              <ScheduleDayHeader key={date} date={date}>
                <label className="flex cursor-pointer items-center gap-1 text-label font-semibold text-text-subtle">
                  <input
                    type="checkbox"
                    aria-label={`Alle tidsluker for ${weekday} ${dayMonth}`}
                    disabled={timeSlots.length === 0}
                    checked={isAllSelected}
                    ref={(input) => {
                      if (input) {
                        input.indeterminate = isSomeSelected && !isAllSelected;
                      }
                    }}
                    onChange={() => {
                      if (isAllSelected) clearAllForDay(date);
                      else selectAllForDay(date);
                    }}
                  />
                  Alle
                </label>
              </ScheduleDayHeader>
            );
          })}

          {chunks.length === 0 ? (
            <div
              className={cn(
                "text-detail font-medium text-text-muted",
                "col-[1/-1] px-4 py-10 text-center text-text-disabled",
              )}
            >
              {dates.length === 0
                ? "Velg en datoperiode for å se tidsplanen."
                : "Ingen tidsluker — endre tidsrom og lagre."}
            </div>
          ) : (
            chunks.map((chunk, chunkIndex) => (
              <React.Fragment key={chunkIndex}>
                <ScheduleTimeLabel
                  startMinute={chunk[0]}
                  endMinute={chunk[chunk.length - 1] + sessionDuration}
                  showEnd={chunk.length > 1}
                />
                {dates.map((date) => {
                  const isEnabled = chunk.some((minute) =>
                    enabledSlots.has(makeSlotKey(date, minute)),
                  );
                  const { weekday, dayMonth } = formatDateHeader(date);
                  const cellLabel = `${weekday} ${dayMonth} ${formatMinutes(
                    chunk[0],
                  )}–${formatMinutes(
                    chunk[chunk.length - 1] + sessionDuration,
                  )}`;

                  return (
                    <ScheduleBlockCell
                      key={`${date}-${chunkIndex}`}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isEnabled}
                      aria-label={cellLabel}
                      onPointerDown={(event) =>
                        handlePointerDown(event, date, chunk)
                      }
                      onPointerEnter={() => handlePointerEnter(date, chunk)}
                      onKeyDown={(event) =>
                        handleCellKeyDown(event, date, chunk)
                      }
                      closed={!isEnabled}
                      className={cn(
                        "cursor-pointer",
                        isEnabled
                          ? "border-brand-activeBorder bg-brand-tint text-brand ring-1 ring-inset ring-brand-border hover:bg-brand-fill"
                          : "hover:border-brand-border",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "pointer-events-none absolute inset-0 transition-[opacity,background-position] duration-300 ease-out motion-reduce:transition-none",
                          "[background-image:var(--pattern-unavailable)]",
                          isEnabled
                            ? "opacity-0 [background-position:8px_8px]"
                            : "opacity-70 [background-position:0_0] group-hover:opacity-100",
                        )}
                      />
                      <ScheduleSlotSegments
                        className="relative z-10 h-schedule-progress"
                        closed={!isEnabled}
                        fills={chunk.map((minute) =>
                          enabledSlots.has(makeSlotKey(date, minute)) ? 1 : 0,
                        )}
                      />
                      <Check
                        size={iconSizes.compact}
                        strokeWidth={iconStrokeWidths.strong}
                        aria-hidden="true"
                        className={cn(
                          "relative z-10 text-brand-dark transition-[opacity,transform] duration-200 motion-reduce:transition-none",
                          isEnabled
                            ? "scale-100 opacity-100"
                            : "scale-75 opacity-0",
                        )}
                      />
                    </ScheduleBlockCell>
                  );
                })}
              </React.Fragment>
            ))
          )}
        </ScheduleGridFrame>
      </div>
    </section>
  );
};

export default AdminAvailabilityGrid;
