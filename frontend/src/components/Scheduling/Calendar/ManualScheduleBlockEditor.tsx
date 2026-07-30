import React, { useMemo, useState } from "react";

import type { ManualScheduleBlock } from "../types";
import {
  formatDateHeader,
  formatMinutes,
  parseSlotKey,
} from "../scheduleUtils";
import { actionButtonBase, actionButtonGhost } from "../ui";
import cn from "src/utils/cn";
import { buildManualBlocksByDay } from "./adminScheduleConfigModel";

const blockDate = (block: ManualScheduleBlock) =>
  parseSlotKey(block.slots[0] ?? "").date;

interface ManualScheduleBlockEditorProps {
  dates: string[];
  dayStartMinute: number;
  dayEndMinute: number;
  sessionDuration: number;
  value: ManualScheduleBlock[];
  disabled?: boolean;
  onChange: (blocks: ManualScheduleBlock[]) => void;
}

const ManualScheduleBlockEditor: React.FC<ManualScheduleBlockEditorProps> = ({
  dates,
  dayStartMinute,
  dayEndMinute,
  sessionDuration,
  value,
  disabled = false,
  onChange,
}) => {
  const [splitPoints, setSplitPoints] = useState<Record<number, number>>({});
  const defaultBlocks = useMemo(
    () =>
      buildManualBlocksByDay({
        dates,
        dayStartMinute,
        dayEndMinute,
        sessionDuration,
      }),
    [dates, dayEndMinute, dayStartMinute, sessionDuration],
  );

  const splitBlock = (blockIndex: number) => {
    const block = value[blockIndex];
    if (!block || block.slots.length < 2) return;
    const splitPoint = splitPoints[blockIndex] ?? 1;
    const left = block.slots.slice(0, splitPoint);
    const right = block.slots.slice(splitPoint);
    if (!left.length || !right.length) return;
    onChange([
      ...value.slice(0, blockIndex),
      { slots: left },
      { slots: right },
      ...value.slice(blockIndex + 1),
    ]);
    setSplitPoints({});
  };

  const mergeBlock = (blockIndex: number) => {
    const block = value[blockIndex];
    if (!block) return;
    const next = value[blockIndex + 1];
    if (next && blockDate(next) === blockDate(block)) {
      onChange([
        ...value.slice(0, blockIndex),
        { slots: [...block.slots, ...next.slots] },
        ...value.slice(blockIndex + 2),
      ]);
      setSplitPoints({});
      return;
    }
    const previous = value[blockIndex - 1];
    if (previous && blockDate(previous) === blockDate(block)) {
      onChange([
        ...value.slice(0, blockIndex - 1),
        { slots: [...previous.slots, ...block.slots] },
        ...value.slice(blockIndex + 1),
      ]);
      setSplitPoints({});
    }
  };

  return (
    <section
      aria-labelledby="manual-blocks-heading"
      className="rounded-lg border border-border bg-surface-muted p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4
            id="manual-blocks-heading"
            className="m-0 text-ui font-bold text-text-primary"
          >
            Manuelle blokker
          </h4>
          <p className="mb-0 mt-1 text-detail text-text-muted">
            Del eller slå sammen sammenhengende tidsluker. Alle tidsluker må
            tilhøre én blokk, også pauser som er stengt for intervju.
          </p>
        </div>
        <button
          type="button"
          className={cn(actionButtonBase, actionButtonGhost, "px-3 py-1.5")}
          disabled={disabled || defaultBlocks.length === 0}
          onClick={() => {
            onChange(defaultBlocks);
            setSplitPoints({});
          }}
        >
          Én blokk per dag
        </button>
      </div>

      {value.length === 0 ? (
        <p className="mb-0 mt-4 text-detail text-warning">
          Velg en gyldig periode før du oppretter manuelle blokker.
        </p>
      ) : (
        <ol className="mb-0 mt-4 space-y-3 pl-5">
          {value.map((block, index) => {
            const first = parseSlotKey(block.slots[0] ?? "");
            const last = parseSlotKey(
              block.slots[block.slots.length - 1] ?? "",
            );
            const dateLabel = first.date
              ? `${formatDateHeader(first.date).weekday} ${formatDateHeader(first.date).dayMonth}`
              : "Ugyldig dato";
            const canMerge =
              (value[index + 1] &&
                blockDate(value[index + 1]) === blockDate(block)) ||
              (value[index - 1] &&
                blockDate(value[index - 1]) === blockDate(block));
            return (
              <li key={`${block.slots[0]}-${block.slots.length}`}>
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-base p-3">
                  <span className="min-w-40 text-detail font-semibold text-text-primary">
                    {dateLabel}: {formatMinutes(first.minute)}–
                    {formatMinutes(last.minute + sessionDuration)}
                  </span>
                  <label className="flex items-center gap-2 text-detail text-text-muted">
                    Del etter
                    <select
                      aria-label={`Del blokk ${index + 1} etter tidsluke`}
                      className="rounded border border-border bg-surface-base px-2 py-1"
                      disabled={disabled || block.slots.length < 2}
                      value={splitPoints[index] ?? 1}
                      onChange={(event) =>
                        setSplitPoints((current) => ({
                          ...current,
                          [index]: Number(event.target.value),
                        }))
                      }
                    >
                      {block.slots.slice(0, -1).map((slot, slotIndex) => {
                        const { minute } = parseSlotKey(slot);
                        return (
                          <option key={slot} value={slotIndex + 1}>
                            {formatMinutes(minute)}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <button
                    type="button"
                    className={cn(
                      actionButtonBase,
                      actionButtonGhost,
                      "px-3 py-1.5",
                    )}
                    disabled={disabled || block.slots.length < 2}
                    onClick={() => splitBlock(index)}
                  >
                    Del blokk
                  </button>
                  <button
                    type="button"
                    className={cn(
                      actionButtonBase,
                      actionButtonGhost,
                      "px-3 py-1.5",
                    )}
                    disabled={disabled || !canMerge}
                    onClick={() => mergeBlock(index)}
                  >
                    Fjern blokk ved å slå sammen
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};

export default ManualScheduleBlockEditor;
