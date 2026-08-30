import React from "react";
import { ArrowUpDown, GripVertical, Lock, Unlock } from "lucide-react";
import type { ScheduleItem, SchedulePanelMember } from "../types";
import { decodeScheduleTime, formatMinutes } from "../scheduleUtils";
import type { AssignmentAvailabilityStatus } from "../assignmentAvailability";
import { getBlockPanelDiff } from "./blockBaseline";
import CandidateSwapChip, {
  type CandidateSwapTarget,
} from "./CandidateSwapChip";
import SlotPanelOverrideMenu from "./SlotPanelOverrideMenu";
import { EditablePanelChip, type PanelChipOption } from "../ui";
import cn from "../../../utils/cn";
import { iconSizes } from "../../../styles/designTokens";

export interface DraftSlotRowProps {
  scheduleIndex: number;
  item: ScheduleItem;
  sessionDuration: number;
  canEditDraft: boolean;
  baselinePanel: SchedulePanelMember[] | null;
  availabilityStatusFor: (
    item: ScheduleItem,
    member: SchedulePanelMember,
  ) => AssignmentAvailabilityStatus;
  hasConflictFor: (
    scheduleIndex: number,
    member: SchedulePanelMember,
  ) => boolean;
  onToggleLock: (scheduleIndex: number) => void;
  isJointTime: boolean;
  moveScope: "interview" | "group";
  isRowSelected: boolean;
  isRowDragged: boolean;
  isDropTarget: boolean;
  isHighlighted: boolean;
  groupSpanningCell?: React.ReactNode;
  renderFlyttCell?: boolean;
  /** All interviewers as swap options for the seat held by `currentMember`,
   *  greyed out (with a reason) when a swap is not allowed — already seated,
   *  inhabil against a candidate in the block, or outside their availability
   *  for this slot. */
  buildReplacementOptions: (
    currentMember: SchedulePanelMember,
  ) => PanelChipOption[];
  onSwapPanelMember: (
    scheduleIndex: number,
    panelMemberIndex: number,
    newName: string,
    newId?: string,
  ) => void;
  candidateSwapTargets?: CandidateSwapTarget[];
  onSwapCandidates?: (sourceIndex: number, targetIndex: number) => void;
  formatSlotTime: (time: number) => string;
  onSelectRow: (scheduleIndex: number) => void;
  onDragStartRow: (
    scheduleIndex: number,
    event: React.DragEvent<HTMLButtonElement>,
  ) => void;
  onDragEndRow: () => void;
  onRowDragOver: (
    scheduleIndex: number,
    event: React.DragEvent<HTMLElement>,
  ) => void;
  onRowDragLeave: (
    scheduleIndex: number,
    event: React.DragEvent<HTMLElement>,
  ) => void;
  onRowDrop: (
    scheduleIndex: number,
    event: React.DragEvent<HTMLElement>,
  ) => void;
}

const shortName = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
};

/** Drop the seat's own occupant from its replacement list (re-picking them is a
 *  no-op the old menus never offered). */
const excludeRef = (
  options: PanelChipOption[],
  ref: { id?: string; name: string },
): PanelChipOption[] =>
  options.filter((option) =>
    option.id && ref.id ? option.id !== ref.id : option.name !== ref.name,
  );

export const DraftSlotRow: React.FC<DraftSlotRowProps> = ({
  scheduleIndex,
  item,
  sessionDuration,
  canEditDraft,
  baselinePanel,
  availabilityStatusFor,
  hasConflictFor,
  onToggleLock,
  isJointTime,
  moveScope,
  isRowSelected,
  isRowDragged,
  isDropTarget,
  isHighlighted,
  groupSpanningCell,
  renderFlyttCell = true,
  buildReplacementOptions,
  onSwapPanelMember,
  candidateSwapTargets,
  onSwapCandidates,
  formatSlotTime,
  onSelectRow,
  onDragStartRow,
  onDragEndRow,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
}) => {
  const diff = getBlockPanelDiff(baselinePanel, item.panel);

  const availabilityIssues = item.panel.filter((member) => {
    const status = availabilityStatusFor(item, member);
    return (
      status === "outside_submitted_availability" ||
      status === "availability_not_submitted"
    );
  });
  const hasAvailabilityIssue = availabilityIssues.length > 0;
  const hasConflict = item.panel.some((member) =>
    hasConflictFor(scheduleIndex, member),
  );

  const warnings: React.ReactNode[] = [];
  if (isJointTime) {
    warnings.push(
      <span
        key="joint"
        className="flex-none rounded bg-brand-soft px-1.5 py-0.5 text-nano font-bold text-brand"
      >
        Felles
      </span>,
    );
  }
  if (hasAvailabilityIssue) {
    warnings.push(
      <span
        key="availability"
        className="flex-none rounded bg-amber-100 px-1.5 py-0.5 text-nano font-bold text-amber-900"
        title={availabilityIssues
          .map(
            (member) =>
              `${member.name}: ${
                availabilityStatusFor(item, member) ===
                "outside_submitted_availability"
                  ? "Utenfor oppgitt tilgjengelighet"
                  : "Tilgjengelighet mangler"
              }`,
          )
          .join("\n")}
      >
        Utenfor tilgjengelighet
      </span>,
    );
  }
  if (hasConflict) {
    warnings.push(
      <span
        key="conflict"
        className="flex-none rounded bg-danger-bg px-1.5 py-0.5 text-nano font-bold text-danger"
        title="Registrert inhabilitet i panelet"
      >
        Inhabilitet
      </span>,
    );
  }

  const startMinute = decodeScheduleTime(item.time, sessionDuration).minute;
  const slotLabel = `${formatMinutes(startMinute)}–${formatMinutes(
    startMinute + sessionDuration,
  )}`;

  let diffNode: React.ReactNode = null;
  if (diff.kind === "swap") {
    const added = diff.added[0];
    const removed = diff.removed[0];
    if (added && removed) {
      const memberIndex = item.panel.findIndex(
        (m) => (added.id && m.id === added.id) || m.name === added.name,
      );

      const replacementOptions: PanelChipOption[] = [
        {
          id: removed.id,
          name: `${removed.name} (Gjenopprett standard)`,
        },
        ...excludeRef(buildReplacementOptions(added), added),
      ];

      diffNode =
        canEditDraft && memberIndex >= 0 ? (
          <EditablePanelChip
            variant="chip"
            tone="overtime"
            label={`${shortName(added.name)} ⇄ ${shortName(removed.name)}`}
            title={`Klikk for å bytte erstatter i dette intervjuet (+ ${added.name}, − ${removed.name})`}
            options={replacementOptions}
            searchPlaceholder="Søk erstatter…"
            onSelect={(newName, newId) => {
              const cleanName = newName.replace(" (Gjenopprett standard)", "");
              onSwapPanelMember(scheduleIndex, memberIndex, cleanName, newId);
            }}
          />
        ) : (
          <span
            className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
            title={`+ ${added.name}\n− ${removed.name}`}
          >
            {shortName(added.name)} ⇄ {shortName(removed.name)}
          </span>
        );
    }
  } else if (diff.kind === "asymmetric") {
    diffNode = (
      <div className="flex flex-wrap items-center gap-1.5">
        {diff.added.map((addedMember) => {
          const memberIndex = item.panel.findIndex(
            (m) =>
              (addedMember.id && m.id === addedMember.id) ||
              m.name === addedMember.name,
          );
          const options: PanelChipOption[] = excludeRef(
            buildReplacementOptions(addedMember),
            addedMember,
          );

          return canEditDraft && memberIndex >= 0 ? (
            <EditablePanelChip
              key={addedMember.name}
              variant="chip"
              tone="overtime"
              label={`+ ${shortName(addedMember.name)}`}
              options={options}
              searchPlaceholder="Søk erstatter…"
              onSelect={(newName, newId) =>
                onSwapPanelMember(scheduleIndex, memberIndex, newName, newId)
              }
            />
          ) : (
            <span
              key={addedMember.name}
              className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
            >
              + {shortName(addedMember.name)}
            </span>
          );
        })}
        {diff.removed.map((removedMember) => (
          <span
            key={removedMember.name}
            className="inline-flex items-center rounded border border-border-soft bg-surface-neutral px-2 py-0.5 text-xs font-medium text-text-muted"
          >
            − {shortName(removedMember.name)}
          </span>
        ))}
      </div>
    );
  } else if (diff.kind === "fallback") {
    diffNode = (
      <div className="flex flex-wrap items-center gap-1.5">
        {item.panel.map((member, mIdx) => {
          const options: PanelChipOption[] = excludeRef(
            buildReplacementOptions(member),
            member,
          );

          return canEditDraft ? (
            <EditablePanelChip
              key={`${member.name}-${mIdx}`}
              variant="chip"
              label={shortName(member.name)}
              options={options}
              searchPlaceholder="Søk intervjuer…"
              onSelect={(newName, newId) =>
                onSwapPanelMember(scheduleIndex, mIdx, newName, newId)
              }
            />
          ) : (
            <span
              key={`${member.name}-${mIdx}`}
              className="text-xs font-medium text-text-muted"
            >
              {shortName(member.name)}
            </span>
          );
        })}
      </div>
    );
  } else {
    // exact: the row runs the block's default panel. Keep the cell quiet —
    // show "—", and clicking opens a 2-step menu to pick which interviewer to replace,
    // which immediately transitions to the searchable replacement dropdown.
    diffNode = canEditDraft ? (
      <SlotPanelOverrideMenu
        item={item}
        scheduleIndex={scheduleIndex}
        buildReplacementOptions={buildReplacementOptions}
        onSwapPanelMember={onSwapPanelMember}
        shortName={shortName}
        hasConflictFor={hasConflictFor}
        availabilityStatusFor={availabilityStatusFor}
      />
    ) : (
      <span
        className="text-text-muted/60 text-sm font-medium"
        aria-hidden="true"
        title="Felles standardpanel for blokken"
      >
        —
      </span>
    );
  }

  return (
    <tr
      id={`schedule-row-${scheduleIndex}`}
      data-cy="block-row"
      onDragOver={(event) => onRowDragOver(scheduleIndex, event)}
      onDragLeave={(event) => onRowDragLeave(scheduleIndex, event)}
      onDrop={(event) => onRowDrop(scheduleIndex, event)}
      className={cn(
        "group border-b border-border-soft bg-surface-base transition-colors hover:bg-surface-subtle",
        isRowDragged && "opacity-40",
        isRowSelected && "ring-2 ring-inset ring-brand bg-brand-soft/30",
        isHighlighted && "bg-brand-soft/40 ring-2 ring-inset ring-brand-ring",
        isDropTarget &&
          (moveScope === "group"
            ? "ring-2 ring-inset ring-brand"
            : "ring-2 ring-inset ring-brand-ring"),
      )}
    >
      {/* Col 1: Spanning group cell OR individual Flytt cell */}
      {groupSpanningCell}
      {!groupSpanningCell && renderFlyttCell && (
        <td className="w-24 whitespace-nowrap px-1 py-3 text-center align-middle">
          {canEditDraft && (
            <div className="flex items-center justify-center gap-1">
              <button
                type="button"
                draggable
                aria-pressed={isRowSelected}
                aria-label={`Flytt intervjuet for ${item.candidate}`}
                title="Dra for å flytte"
                onClick={() => onSelectRow(scheduleIndex)}
                onDragStart={(event) => onDragStartRow(scheduleIndex, event)}
                onDragEnd={onDragEndRow}
                className={cn(
                  "inline-flex items-center justify-center p-1 rounded transition-colors cursor-grab active:cursor-grabbing",
                  isRowSelected
                    ? "bg-brand text-white shadow-xs"
                    : "text-text-faded hover:text-text-primary hover:bg-surface-subtle",
                )}
              >
                <GripVertical size={iconSizes.detail} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onSelectRow(scheduleIndex)}
                aria-pressed={isRowSelected}
                title={
                  isRowSelected
                    ? "Valgt – klikk et annet intervju for å bytte plass"
                    : "Klikk for å bytte plass med et annet intervju"
                }
                className={cn(
                  "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-nano font-semibold transition-colors border cursor-pointer",
                  isRowSelected
                    ? "border-brand bg-brand text-white shadow-xs ring-2 ring-brand-ring"
                    : "border-border-soft bg-surface-base text-text-muted hover:border-border-quiet hover:bg-surface-subtle hover:text-text-primary",
                )}
              >
                <ArrowUpDown size={10} aria-hidden="true" />
                <span>{isRowSelected ? "Valgt" : "Bytt"}</span>
              </button>
            </div>
          )}
        </td>
      )}

      {/* Col 2: Tidspunkt */}
      <td className="w-36 whitespace-nowrap px-4 py-3 text-sm tabular-nums font-semibold text-text-primary align-middle">
        {slotLabel}
      </td>

      {/* Col 3: Kandidat (Clickable CandidateSwapChip for swaps) */}
      <td className="w-60 px-4 py-3 align-middle">
        <div className="flex min-w-0 items-center gap-2">
          {canEditDraft &&
          onSwapCandidates &&
          candidateSwapTargets &&
          candidateSwapTargets.length > 0 ? (
            <CandidateSwapChip
              item={item}
              scheduleIndex={scheduleIndex}
              targets={candidateSwapTargets}
              formatTimeLabel={formatSlotTime}
              onSwap={onSwapCandidates}
              conflict={hasConflict}
            />
          ) : (
            <span className="truncate text-sm font-semibold text-text-primary">
              {item.candidate}
            </span>
          )}
          {warnings}
        </div>
      </td>

      {/* Col 4: Panel (Clickable diff chips and hover override menu) */}
      <td className="px-4 py-3 align-middle">{diffNode}</td>

      {/* Col 5: Lås (Ghost toggle button with Lock/Unlock) */}
      <td className="w-16 px-4 py-3 text-center align-middle">
        {canEditDraft && (
          <button
            type="button"
            onClick={() => onToggleLock(scheduleIndex)}
            aria-label={
              item.locked
                ? `Lås opp intervjuet for ${item.candidate}`
                : `Lås intervjuet for ${item.candidate}`
            }
            title={
              item.locked
                ? "Låst til dette tidspunktet (klikk for å låse opp)"
                : "Klikk for å låse til dette tidspunktet"
            }
            className={cn(
              "inline-flex items-center justify-center p-1.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand",
              item.locked
                ? "text-brand hover:bg-brand-soft"
                : "text-text-faded hover:text-text-muted hover:bg-surface-subtle",
            )}
          >
            {item.locked ? (
              <Lock size={iconSizes.small} aria-hidden="true" />
            ) : (
              <Unlock size={iconSizes.small} aria-hidden="true" />
            )}
          </button>
        )}
      </td>
    </tr>
  );
};
