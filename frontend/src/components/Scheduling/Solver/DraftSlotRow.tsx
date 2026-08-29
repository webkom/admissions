import React, { useEffect, useRef, useState } from "react";
import { ArrowUpDown, GripVertical, Lock, Unlock } from "lucide-react";
import type { Interviewer, ScheduleItem, SchedulePanelMember } from "../types";
import { decodeScheduleTime, formatMinutes } from "../scheduleUtils";
import type { AssignmentAvailabilityStatus } from "../assignmentAvailability";
import { getBlockPanelDiff } from "./blockBaseline";
import CandidateSwapChip, {
  type CandidateSwapTarget,
} from "./CandidateSwapChip";
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
  interviewerOptions: Interviewer[];
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

const SlotPanelOverrideMenu: React.FC<{
  item: ScheduleItem;
  scheduleIndex: number;
  interviewerOptions: Interviewer[];
  onSwapPanelMember: (
    scheduleIndex: number,
    panelMemberIndex: number,
    newName: string,
    newId?: string,
  ) => void;
}> = ({ item, scheduleIndex, interviewerOptions, onSwapPanelMember }) => {
  const [selectedMemberIndex, setSelectedMemberIndex] = useState<number | null>(
    null,
  );
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSelectedMemberIndex(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (selectedMemberIndex !== null) {
    const member = item.panel[selectedMemberIndex];
    if (!member) return null;
    const options: PanelChipOption[] = interviewerOptions
      .filter((inv) => !item.panel.some((m) => m.name === inv.name))
      .map((inv) => ({ id: inv.id, name: inv.name }));

    return (
      <div className="flex items-center gap-1">
        <span className="text-nano font-medium text-text-muted">
          Bytt {shortName(member.name)}:
        </span>
        <EditablePanelChip
          variant="chip"
          label="Velg erstatter…"
          options={options}
          searchPlaceholder="Søk intervjuer…"
          onSelect={(newName, newId) => {
            onSwapPanelMember(
              scheduleIndex,
              selectedMemberIndex,
              newName,
              newId,
            );
            setSelectedMemberIndex(null);
          }}
        />
        <button
          type="button"
          onClick={() => setSelectedMemberIndex(null)}
          className="px-1 text-nano text-text-muted hover:text-text-primary"
          title="Avbryt"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div ref={menuRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex cursor-pointer items-center gap-1 rounded border border-dashed border-border-soft px-2 py-0.5 text-xs text-text-muted transition-all hover:border-brand/40 hover:bg-surface-subtle hover:text-brand"
        title="Bytt ut et panelmedlem for dette intervjuet"
      >
        <ArrowUpDown size={11} aria-hidden="true" />
        <span>Bytt intervjuer</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[180px] rounded-lg border border-border-soft bg-surface-base p-1 shadow-lg">
          <div className="mb-1 border-b border-border-soft px-2 py-1 text-nano font-semibold text-text-muted">
            Hvem skal byttes ut?
          </div>
          {item.panel.map((member, idx) => (
            <button
              key={`${member.name}-${idx}`}
              type="button"
              onClick={() => {
                setIsOpen(false);
                setSelectedMemberIndex(idx);
              }}
              className="flex w-full cursor-pointer items-center justify-between rounded px-2 py-1.5 text-left text-xs font-medium text-text-primary transition-colors hover:bg-surface-subtle hover:text-brand"
            >
              <span>{member.name}</span>
              <ArrowUpDown size={10} className="text-text-muted opacity-60" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

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
  interviewerOptions,
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
        ...interviewerOptions
          .filter(
            (inv) =>
              inv.name !== added.name &&
              !item.panel.some((m) => m.name === inv.name),
          )
          .map((inv) => ({
            id: inv.id,
            name: inv.name,
          })),
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
          const options: PanelChipOption[] = interviewerOptions
            .filter((inv) => !item.panel.some((m) => m.name === inv.name))
            .map((inv) => ({ id: inv.id, name: inv.name }));

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
          const options: PanelChipOption[] = interviewerOptions
            .filter(
              (inv) =>
                inv.name !== member.name &&
                !item.panel.some((m) => m.name === inv.name),
            )
            .map((inv) => ({ id: inv.id, name: inv.name }));

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
    // exact: matches baseline. Show "—" by default, and reveal "Bytt intervjuer" on hover/focus!
    diffNode = (
      <div className="relative flex items-center min-h-[24px]">
        <span
          className="text-text-muted/60 text-sm font-medium transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
          aria-hidden="true"
          title="Felles standardpanel for blokken"
        >
          —
        </span>
        {canEditDraft && (
          <div className="absolute left-0 top-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100">
            <SlotPanelOverrideMenu
              item={item}
              scheduleIndex={scheduleIndex}
              interviewerOptions={interviewerOptions}
              onSwapPanelMember={onSwapPanelMember}
            />
          </div>
        )}
      </div>
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
              twoStep
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

export default DraftSlotRow;
