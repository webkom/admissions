import React from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { iconSizes, iconStrokeWidths } from "src/styles/designTokens";
import cn from "src/utils/cn";
import { formatDateHeader, formatMinutes, makeSlotKey } from "../scheduleUtils";
import {
  ScheduleBlockCell,
  ScheduleSelectableBlockCell,
  ScheduleSlotSegments,
  ScheduleTimeLabel,
  scheduleAvailableCellClass,
  scheduleInteractiveCellMotionClass,
  scheduleSelectedCellClass,
  scheduleSelectionMarkClass,
} from "./ScheduleGridFrame";
import ScheduleGridFrame from "./ScheduleGridFrame";
import type { SchedulePatternRow } from "./adminScheduleConfigModel";
import {
  isScheduleGridToggleKey,
  useScheduleGridDragToggle,
  type ScheduleGridToggleMode,
} from "./useScheduleGridDragToggle";

type EditorView = "blocks" | "fine";

interface SlotEditorState {
  date: string;
  row: SchedulePatternRow;
  anchor: HTMLElement;
}

interface AdminSchedulePatternGridProps {
  dates: string[];
  rows: SchedulePatternRow[];
  blockSize: number;
  sessionDuration: number;
  activeSlots: ReadonlySet<string>;
  view: EditorView;
  disabled?: boolean;
  renderDayHeader: (date: string) => React.ReactNode;
  onSetBlock: (date: string, minutes: number[], open: boolean) => void;
  onToggleSlot: (date: string, minute: number) => void;
  emptyState?: React.ReactNode;
}

const pointerToggleMode = (
  activeSlots: ReadonlySet<string>,
  date: string,
  minute: number,
): ScheduleGridToggleMode =>
  activeSlots.has(makeSlotKey(date, minute)) ? "remove" : "add";

const accessibleDateLabel = (date: string) => {
  const { weekday, dayMonth } = formatDateHeader(date);
  return `${weekday} ${dayMonth}`;
};

const SlotEditorPopover: React.FC<{
  state: SlotEditorState;
  sessionDuration: number;
  activeSlots: ReadonlySet<string>;
  onToggleSlot: (date: string, minute: number) => void;
  onClose: () => void;
}> = ({ state, sessionDuration, activeSlots, onToggleSlot, onClose }) => {
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState<React.CSSProperties>({});
  const titleId = React.useId();
  const closeAndRestoreFocus = React.useCallback(() => {
    const popover = popoverRef.current;
    const activeBeforeClose = document.activeElement;
    const shouldRestoreFocus =
      activeBeforeClose === null ||
      activeBeforeClose === document.body ||
      Boolean(
        activeBeforeClose &&
          (activeBeforeClose === state.anchor ||
            popover?.contains(activeBeforeClose)),
      );

    onClose();
    requestAnimationFrame(() => {
      const activeAfterClose = document.activeElement;
      const focusMovedElsewhere = Boolean(
        activeAfterClose &&
          activeAfterClose !== document.body &&
          activeAfterClose !== state.anchor,
      );

      if (
        shouldRestoreFocus &&
        !focusMovedElsewhere &&
        state.anchor.isConnected
      ) {
        state.anchor.focus();
      }
    });
  }, [onClose, state.anchor]);

  const updatePosition = React.useCallback(() => {
    const rect = state.anchor.getBoundingClientRect();
    const viewportPadding = 12;
    const width = Math.min(320, window.innerWidth - viewportPadding * 2);
    const estimatedHeight = Math.min(360, 116 + state.row.minutes.length * 42);
    const availableBelow = window.innerHeight - rect.bottom - 18;
    const availableAbove = rect.top - 18;
    const openUpwards =
      availableBelow < estimatedHeight && availableAbove > availableBelow;
    const availableHeight = openUpwards ? availableAbove : availableBelow;
    const useViewportHeight = availableHeight < 160;
    setPosition({
      left: Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - width - viewportPadding),
      ),
      width,
      top: useViewportHeight
        ? viewportPadding
        : openUpwards
          ? undefined
          : rect.bottom + 6,
      bottom: useViewportHeight
        ? viewportPadding
        : openUpwards
          ? window.innerHeight - rect.top + 6
          : undefined,
      maxHeight: useViewportHeight
        ? Math.max(0, window.innerHeight - viewportPadding * 2)
        : Math.min(360, availableHeight),
    });
  }, [state.anchor, state.row.minutes.length]);

  React.useLayoutEffect(() => {
    updatePosition();
    const frame = requestAnimationFrame(() => {
      popoverRef.current
        ?.querySelector<HTMLButtonElement>("[data-slot]")
        ?.focus();
    });
    const handleViewportChange = () => updatePosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [updatePosition]);

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || state.anchor.contains(target))
        return;
      closeAndRestoreFocus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeAndRestoreFocus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeAndRestoreFocus, state.anchor]);

  const isPause = state.row.kind === "pause";
  const firstMinute = state.row.minutes[0];
  const lastMinute = state.row.minutes[state.row.minutes.length - 1];
  const title = `${
    isPause ? "Planlagt pause" : "Finjuster intervjuer"
  }, ${accessibleDateLabel(state.date)}`;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-labelledby={titleId}
      data-cy="schedule-slot-editor"
      className="fixed z-30 overflow-y-auto rounded-lg border border-border bg-surface-base p-3 shadow-lg"
      style={position}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 id={titleId} className="m-0 text-ui font-bold text-text-primary">
            {title}
          </h4>
          {firstMinute !== undefined && lastMinute !== undefined && (
            <p className="m-0 mt-0.5 text-detail tabular-nums text-text-muted">
              {formatMinutes(firstMinute)}–
              {formatMinutes(lastMinute + sessionDuration)}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Lukk tidsvelger"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-subtle hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-focus"
          onClick={closeAndRestoreFocus}
        >
          <X size={iconSizes.small} aria-hidden="true" />
        </button>
      </div>
      {isPause && (
        <p className="m-0 mt-2 text-detail leading-relaxed text-text-muted">
          Åpnede tider blir ekstratider i den planlagte pausen.
        </p>
      )}
      <div className="mt-3 grid gap-1.5">
        {state.row.minutes.map((minute) => {
          const key = makeSlotKey(state.date, minute);
          const active = activeSlots.has(key);
          return (
            <button
              key={minute}
              data-slot=""
              type="button"
              aria-pressed={active}
              aria-label={`${accessibleDateLabel(state.date)}, ${formatMinutes(
                minute,
              )}–${formatMinutes(minute + sessionDuration)}, ${
                active ? (isPause ? "ekstratid" : "åpen") : "stengt"
              }`}
              className={cn(
                "flex min-h-10 items-center justify-between rounded-md border px-3 text-detail font-semibold tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-focus",
                active
                  ? "border-brand-border bg-brand-soft text-brand-dark"
                  : "border-border-soft bg-surface-neutral text-text-muted hover:border-brand-border hover:bg-surface-base",
              )}
              onClick={() => onToggleSlot(state.date, minute)}
            >
              <span>
                {formatMinutes(minute)}–
                {formatMinutes(minute + sessionDuration)}
              </span>
              <span>
                {active ? (isPause ? "Ekstratid" : "Åpen") : "Stengt"}
              </span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
};

const AdminSchedulePatternGrid: React.FC<AdminSchedulePatternGridProps> = ({
  dates,
  rows,
  blockSize,
  sessionDuration,
  activeSlots,
  view,
  disabled = false,
  renderDayHeader,
  onSetBlock,
  onToggleSlot,
  emptyState,
}) => {
  const [slotEditor, setSlotEditor] = React.useState<SlotEditorState | null>(
    null,
  );
  const activeSlotsRef = React.useRef(activeSlots);
  const previousViewRef = React.useRef(view);

  React.useEffect(() => {
    activeSlotsRef.current = activeSlots;
  }, [activeSlots]);
  React.useEffect(() => {
    if (previousViewRef.current === view) return;
    previousViewRef.current = view;
    setSlotEditor(null);
  }, [view]);

  const regularPauseMinutes = React.useMemo(() => {
    const pauseDurations = rows
      .filter((row) => row.kind === "pause")
      .map((row) => row.endMinute - row.startMinute)
      .filter((duration) => duration > 0);
    return pauseDurations.length > 0 ? Math.min(...pauseDurations) : null;
  }, [rows]);
  const visibleRows = React.useMemo(() => {
    if (view === "fine") return rows;
    return rows.filter(
      (row) =>
        row.kind === "block" ||
        (regularPauseMinutes !== null &&
          row.endMinute - row.startMinute > regularPauseMinutes),
    );
  }, [regularPauseMinutes, rows, view]);

  const setSlot = React.useCallback(
    (date: string, minute: number, mode: ScheduleGridToggleMode) => {
      const key = makeSlotKey(date, minute);
      const isActive = activeSlotsRef.current.has(key);
      if ((mode === "add") === isActive) return;
      const nextSlots = new Set(activeSlotsRef.current);
      if (mode === "add") nextSlots.add(key);
      else nextSlots.delete(key);
      activeSlotsRef.current = nextSlots;
      onToggleSlot(date, minute);
    },
    [onToggleSlot],
  );
  const blockDrag = useScheduleGridDragToggle({
    getMode: ({ date, minutes }: { date: string; minutes: number[] }) =>
      minutes.some((minute) => activeSlots.has(makeSlotKey(date, minute)))
        ? "remove"
        : "add",
    apply: ({ date, minutes }, mode) =>
      onSetBlock(date, minutes, mode === "add"),
  });
  const slotDrag = useScheduleGridDragToggle({
    getMode: ({ date, minute }: { date: string; minute: number }) =>
      pointerToggleMode(activeSlotsRef.current, date, minute),
    apply: ({ date, minute }, mode) => setSlot(date, minute, mode),
  });

  const renderBlockCell = (
    date: string,
    row: Extract<SchedulePatternRow, { kind: "block" }>,
  ) => {
    const activeCount = row.minutes.filter((minute) =>
      activeSlots.has(makeSlotKey(date, minute)),
    ).length;
    const isActive = activeCount === row.minutes.length;
    const isPartial = activeCount > 0 && !isActive;
    const startMinute = row.minutes[0];
    const endMinute = row.minutes[row.minutes.length - 1] + sessionDuration;
    const widthPercent = Math.max(
      1,
      Math.min(100, (row.minutes.length / Math.max(1, blockSize)) * 100),
    );
    const width = row.boundaryShort ? `max(2.5rem, ${widthPercent}%)` : "100%";
    const statusLabel = row.boundaryShort
      ? isPartial
        ? `${activeCount}/${row.minutes.length} åpne`
        : isActive
          ? "Åpen"
          : "Stengt"
      : isPartial
        ? `${activeCount}/${row.minutes.length}`
        : isActive
          ? "Åpen"
          : "Stengt";
    const cellLabel = `${accessibleDateLabel(date)}, ${formatMinutes(
      startMinute,
    )}–${formatMinutes(endMinute)}, ${statusLabel}`;
    const canEditInline = row.minutes.length <= 4;

    if (view === "blocks") {
      return (
        <ScheduleSelectableBlockCell
          key={`${date}-${row.id}`}
          data-cy="pattern-block"
          data-date={date}
          data-row-id={row.id}
          data-boundary-short={row.boundaryShort || undefined}
          activeCount={activeCount}
          totalCount={row.minutes.length}
          fills={row.minutes.map((minute) =>
            activeSlots.has(makeSlotKey(date, minute)) ? 1 : 0,
          )}
          selectable
          trackStyle={{ width }}
          trackDataCy="block-footprint"
          statusText={row.boundaryShort || isPartial ? statusLabel : undefined}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-pressed={isPartial ? "mixed" : isActive}
          aria-label={cellLabel}
          className={disabled ? "cursor-not-allowed opacity-70" : undefined}
          onPointerDown={
            disabled
              ? undefined
              : (event) => {
                  blockDrag.onPointerDown(event, {
                    date,
                    minutes: row.minutes,
                  });
                }
          }
          onPointerEnter={
            disabled
              ? undefined
              : () => {
                  blockDrag.onPointerEnter({ date, minutes: row.minutes });
                }
          }
          onClick={
            disabled
              ? undefined
              : (event) => {
                  if (event.detail === 0)
                    onSetBlock(date, row.minutes, activeCount === 0);
                }
          }
          onKeyDown={
            disabled
              ? undefined
              : (event) => {
                  if (!isScheduleGridToggleKey(event.key)) return;
                  event.preventDefault();
                  onSetBlock(date, row.minutes, activeCount === 0);
                }
          }
        />
      );
    }

    const content = (
      <div className="flex w-full min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <div
            data-cy="block-footprint"
            style={{ width }}
            className={cn(
              "min-w-0 rounded-sm p-1 transition-colors duration-200 motion-reduce:transition-none",
              view === "fine" && "bg-surface-base/75",
            )}
          >
            {view === "fine" && canEditInline ? (
              <div className="flex min-h-7 w-full gap-1" role="group">
                {row.minutes.map((minute) => {
                  const key = makeSlotKey(date, minute);
                  const active = activeSlots.has(key);
                  return (
                    <button
                      key={minute}
                      data-cy="fine-slot"
                      data-date={date}
                      data-minute={minute}
                      type="button"
                      disabled={disabled}
                      aria-pressed={active}
                      aria-label={`${accessibleDateLabel(
                        date,
                      )}, ${formatMinutes(minute)}–${formatMinutes(
                        minute + sessionDuration,
                      )}, ${active ? "åpen" : "stengt"}`}
                      title={`${formatMinutes(minute)}–${formatMinutes(
                        minute + sessionDuration,
                      )}`}
                      className={cn(
                        "min-h-7 min-w-0 flex-1 rounded-sm border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-focus",
                        scheduleInteractiveCellMotionClass,
                        active
                          ? "border-brand-activeBorder bg-brand-soft"
                          : scheduleAvailableCellClass,
                        disabled && "cursor-not-allowed opacity-70",
                      )}
                      onPointerDown={(event) => {
                        slotDrag.onPointerDown(event, { date, minute });
                      }}
                      onPointerEnter={() => {
                        slotDrag.onPointerEnter({ date, minute });
                      }}
                      onClick={(event) => {
                        if (event.detail === 0) onToggleSlot(date, minute);
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <ScheduleSlotSegments
                className="h-schedule-progress"
                closed={activeCount === 0}
                fills={row.minutes.map((minute) =>
                  activeSlots.has(makeSlotKey(date, minute)) ? 1 : 0,
                )}
              />
            )}
          </div>
        </div>
        <span className="ml-auto flex-none text-label font-bold tabular-nums">
          {!row.boundaryShort && !isPartial ? (
            <Check
              size={iconSizes.compact}
              strokeWidth={iconStrokeWidths.strong}
              aria-hidden="true"
              className={cn(
                scheduleSelectionMarkClass,
                isActive ? "scale-100 opacity-60" : "scale-75 opacity-0",
              )}
            />
          ) : (
            <span
              className={
                activeCount > 0 ? "text-brand-dark" : "text-text-disabled"
              }
            >
              {statusLabel}
            </span>
          )}
        </span>
      </div>
    );

    if (view === "fine" && !canEditInline) {
      return (
        <ScheduleBlockCell
          key={`${date}-${row.id}`}
          data-cy="pattern-block"
          data-date={date}
          data-row-id={row.id}
          data-boundary-short={row.boundaryShort || undefined}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label={`${cellLabel}. Åpne for å finjustere.`}
          aria-expanded={
            slotEditor?.date === date && slotEditor.row.id === row.id
          }
          className={cn(
            scheduleInteractiveCellMotionClass,
            disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
            isActive || isPartial
              ? scheduleSelectedCellClass
              : scheduleAvailableCellClass,
          )}
          onClick={(event) => {
            if (!disabled)
              setSlotEditor({ date, row, anchor: event.currentTarget });
          }}
          onKeyDown={(event) => {
            if (!isScheduleGridToggleKey(event.key)) return;
            if (disabled) return;
            event.preventDefault();
            setSlotEditor({ date, row, anchor: event.currentTarget });
          }}
        >
          {content}
        </ScheduleBlockCell>
      );
    }

    return (
      <ScheduleBlockCell
        key={`${date}-${row.id}`}
        data-cy="pattern-block"
        data-date={date}
        data-row-id={row.id}
        data-boundary-short={row.boundaryShort || undefined}
        role={undefined}
        tabIndex={undefined}
        aria-disabled={undefined}
        aria-pressed={undefined}
        aria-label={undefined}
        className={cn(
          scheduleInteractiveCellMotionClass,
          scheduleAvailableCellClass,
        )}
      >
        {content}
      </ScheduleBlockCell>
    );
  };

  const renderPauseCell = (
    date: string,
    row: Extract<SchedulePatternRow, { kind: "pause" }>,
  ) => {
    const activeCount = row.minutes.filter((minute) =>
      activeSlots.has(makeSlotKey(date, minute)),
    ).length;
    const label = activeCount > 0 ? `Ekstratid, ${activeCount}` : "Pause";
    const baseClass = cn(
      "flex min-h-8 w-full items-center justify-center rounded border border-dashed px-2 text-label font-semibold transition-colors",
      activeCount > 0
        ? "border-brand-border bg-brand-soft text-brand-dark"
        : "border-border-muted bg-surface-muted text-text-subtle",
    );

    if (view === "fine" && row.minutes.length > 0) {
      return (
        <button
          key={`${date}-${row.id}`}
          type="button"
          disabled={disabled}
          aria-label={`Planlagt pause ${accessibleDateLabel(
            date,
          )} ${formatMinutes(row.startMinute)}–${formatMinutes(
            row.endMinute,
          )}. ${label}.`}
          aria-expanded={
            slotEditor?.date === date && slotEditor.row.id === row.id
          }
          data-cy="planned-pause"
          data-date={date}
          data-row-id={row.id}
          className={cn(
            baseClass,
            "cursor-pointer hover:border-brand-border hover:bg-surface-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-focus",
          )}
          onClick={(event) =>
            setSlotEditor({ date, row, anchor: event.currentTarget })
          }
        >
          {label}
        </button>
      );
    }

    return (
      <div
        key={`${date}-${row.id}`}
        data-cy="planned-pause"
        data-date={date}
        data-row-id={row.id}
        className={baseClass}
      >
        {label}
      </div>
    );
  };

  return (
    <>
      <ScheduleGridFrame
        dates={dates}
        gridClassName={cn("items-stretch", view === "blocks" && "gap-y-2")}
      >
        <div />
        {dates.map((date) => (
          <React.Fragment key={date}>{renderDayHeader(date)}</React.Fragment>
        ))}
        {visibleRows.length === 0 && emptyState
          ? emptyState
          : visibleRows.map((row) => {
              if (row.kind === "pause" && view === "blocks") {
                const duration = row.endMinute - row.startMinute;
                return (
                  <div
                    key={row.id}
                    data-cy="long-pause-divider"
                    className="col-[1/-1] flex items-center gap-3 py-1 text-text-muted"
                  >
                    <span className="h-px flex-1 bg-border-soft" />
                    <span className="text-detail font-medium tabular-nums">
                      Lengre pause, {duration} min
                    </span>
                    <span className="h-px flex-1 bg-border-soft" />
                  </div>
                );
              }

              return (
                <React.Fragment key={row.id}>
                  {row.kind === "block" ? (
                    <ScheduleTimeLabel
                      startMinute={row.minutes[0]}
                      endMinute={
                        row.minutes[row.minutes.length - 1] + sessionDuration
                      }
                      showEnd
                    />
                  ) : (
                    <div className="flex min-h-8 flex-col items-end justify-center pr-2 text-right">
                      <span className="text-nano font-semibold uppercase tracking-wide text-text-disabled">
                        Pause
                      </span>
                      <span className="text-nano tabular-nums text-text-disabled">
                        {formatMinutes(row.startMinute)}–
                        {formatMinutes(row.endMinute)}
                      </span>
                    </div>
                  )}
                  {dates.map((date) =>
                    row.kind === "block"
                      ? renderBlockCell(date, row)
                      : renderPauseCell(date, row),
                  )}
                </React.Fragment>
              );
            })}
      </ScheduleGridFrame>
      {slotEditor && (
        <SlotEditorPopover
          state={slotEditor}
          sessionDuration={sessionDuration}
          activeSlots={activeSlots}
          onToggleSlot={onToggleSlot}
          onClose={() => setSlotEditor(null)}
        />
      )}
    </>
  );
};

export default AdminSchedulePatternGrid;
