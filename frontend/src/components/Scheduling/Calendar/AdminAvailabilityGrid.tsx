import React from "react";
import cn from "src/utils/cn";
import { SegmentedControl, actionButtonBase, actionButtonGhost } from "../ui";
import { formatDateHeader, makeSlotKey } from "../scheduleUtils";
import AdminSchedulePatternGrid from "./AdminSchedulePatternGrid";
import {
  ScheduleDayHeader,
  ScheduleGridLegendItem,
  scheduleOpenLegendStyle,
} from "./ScheduleGridFrame";
import { buildSchedulePatternRows } from "./adminScheduleConfigModel";

type EditingMode = "blocks" | "slots";

interface AdminAvailabilityGridProps {
  dates: string[];
  chunks: number[][];
  blockSize: number;
  enabledSlots: ReadonlySet<string>;
  sessionDuration: number;
  view: EditingMode;
  customizationCount: number;
  fineTuningDisabled?: boolean;
  editingDisabled?: boolean;
  onChangeView: (view: EditingMode) => void;
  onResetCustomizations: () => void;
  onSetBlock: (date: string, minutes: number[], open: boolean) => void;
  onToggleSlot: (date: string, minute: number) => void;
  onOpenAllBlocks: () => void;
  onCloseAllCapacity: () => void;
  onToggleDayBlocks: (date: string, open: boolean) => void;
}

const AdminAvailabilityGrid: React.FC<AdminAvailabilityGridProps> = ({
  dates,
  chunks,
  blockSize,
  enabledSlots,
  sessionDuration,
  view,
  customizationCount,
  fineTuningDisabled = false,
  editingDisabled = false,
  onChangeView,
  onResetCustomizations,
  onSetBlock,
  onToggleSlot,
  onOpenAllBlocks,
  onCloseAllCapacity,
  onToggleDayBlocks,
}) => {
  const interviewSlots = React.useMemo(() => chunks.flat(), [chunks]);
  const patternRows = React.useMemo(
    () => buildSchedulePatternRows(chunks, sessionDuration, blockSize),
    [blockSize, chunks, sessionDuration],
  );
  const openedPauseSlotCount = React.useMemo(
    () =>
      patternRows.reduce(
        (count, row) =>
          row.kind === "pause"
            ? count +
              dates.reduce(
                (dateCount, date) =>
                  dateCount +
                  row.minutes.filter((minute) =>
                    enabledSlots.has(makeSlotKey(date, minute)),
                  ).length,
                0,
              )
            : count,
        0,
      ),
    [dates, enabledSlots, patternRows],
  );
  const hasOpenedPauseSlot = openedPauseSlotCount > 0;

  const handleCloseAllCapacity = () => {
    if (
      view === "blocks" &&
      hasOpenedPauseSlot &&
      !window.confirm(
        `Dette stenger også ${openedPauseSlotCount} ${
          openedPauseSlotCount === 1 ? "ekstratid" : "ekstratider"
        } som er åpnet i planlagte pauser.`,
      )
    )
      return;
    onCloseAllCapacity();
  };

  return (
    <section className="border-t border-border-soft">
      <div className="grid gap-3 px-5 py-3 handheld:px-4 tablet:grid-cols-[minmax(0,1fr)_auto] tablet:items-center">
        <div className="min-w-0">
          <div
            data-cy="schedule-grid-legend"
            className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2"
          >
            <ScheduleGridLegendItem
              label="Åpen for intervju"
              swatchClassName="border-border bg-surface-base"
              swatchStyle={scheduleOpenLegendStyle}
            />
            <ScheduleGridLegendItem
              label="Stengt"
              swatchClassName="border-border-soft bg-surface-neutral [background-image:var(--pattern-unavailable)]"
            />
            {(view === "slots" || hasOpenedPauseSlot) && (
              <ScheduleGridLegendItem
                label="Ekstratid"
                swatchClassName="border-dashed border-brand-border bg-brand-soft"
              />
            )}
          </div>
        </div>
        <SegmentedControl<EditingMode>
          value={view}
          onChange={onChangeView}
          aria-label="Redigeringsnivå for intervjutider"
          items={[
            { key: "blocks", label: "Hele blokker" },
            {
              key: "slots",
              label: "Enkelttider",
              disabled: fineTuningDisabled,
              title: fineTuningDisabled
                ? "Tilbakestill eldre blokkoppsett før du åpner enkelttider"
                : undefined,
            },
          ]}
        />
      </div>

      {fineTuningDisabled && (
        <p className="mx-5 mb-3 mt-0 text-detail font-medium text-warning handheld:mx-4">
          Tilbakestill det eldre blokkoppsettet før du endrer intervjutidene.
        </p>
      )}

      {view === "slots" && (
        <div
          data-cy="manual-slot-editing-notice"
          className="mx-5 mb-3 flex flex-wrap items-center justify-between gap-3 border-y border-border-soft py-2.5 text-detail text-text-muted handheld:mx-4"
        >
          <p className="m-0 leading-relaxed">
            Velg enkelttider i blokkene. Planlagte pauser åpnes som ekstratider.
          </p>
          {customizationCount > 0 && (
            <button
              type="button"
              className={cn(actionButtonBase, actionButtonGhost, "px-0 py-1")}
              disabled={editingDisabled}
              onClick={onResetCustomizations}
            >
              Tilbakestill til baseline-mønster
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 px-5 pb-3 handheld:px-4">
        <button
          type="button"
          className={cn(actionButtonBase, actionButtonGhost, "px-3 py-1.5")}
          disabled={editingDisabled}
          onClick={onOpenAllBlocks}
        >
          Åpne alle blokker
        </button>
        <button
          type="button"
          className={cn(actionButtonBase, actionButtonGhost, "px-3 py-1.5")}
          disabled={editingDisabled}
          onClick={handleCloseAllCapacity}
        >
          Steng alle tider
        </button>
      </div>

      <div className="select-none px-5 pb-5 handheld:px-4 handheld:pb-4">
        <AdminSchedulePatternGrid
          dates={dates}
          rows={patternRows}
          blockSize={blockSize}
          sessionDuration={sessionDuration}
          activeSlots={enabledSlots}
          view={view}
          disabled={editingDisabled}
          onSetBlock={onSetBlock}
          onToggleSlot={onToggleSlot}
          renderDayHeader={(date) => {
            const { weekday, dayMonth } = formatDateHeader(date);
            const isAllSelected =
              interviewSlots.length > 0 &&
              interviewSlots.every((minute) =>
                enabledSlots.has(makeSlotKey(date, minute)),
              );
            const isSomeSelected = interviewSlots.some((minute) =>
              enabledSlots.has(makeSlotKey(date, minute)),
            );

            return (
              <ScheduleDayHeader
                key={date}
                date={date}
                className="h-auto min-h-16"
              >
                <label className="flex cursor-pointer items-center gap-1 text-label font-semibold text-text-subtle">
                  <input
                    type="checkbox"
                    aria-label={`Alle blokker for ${weekday} ${dayMonth}`}
                    className="h-3.5 w-3.5 accent-brand"
                    disabled={editingDisabled || interviewSlots.length === 0}
                    checked={isAllSelected}
                    ref={(input) => {
                      if (input)
                        input.indeterminate = isSomeSelected && !isAllSelected;
                    }}
                    onChange={() => onToggleDayBlocks(date, !isAllSelected)}
                  />
                  Alle blokker
                </label>
              </ScheduleDayHeader>
            );
          }}
          emptyState={
            <div
              className={cn(
                "text-detail font-medium text-text-muted",
                "col-[1/-1] px-4 py-10 text-center text-text-disabled",
              )}
            >
              {dates.length === 0
                ? "Velg en datoperiode for å se tidsplanen."
                : "Ingen intervjutider — endre tidsrommet."}
            </div>
          }
        />
      </div>
    </section>
  );
};

export default AdminAvailabilityGrid;
