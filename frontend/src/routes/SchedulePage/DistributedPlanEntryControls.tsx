import React from "react";
import { Lock, Unlock, Wrench } from "lucide-react";
import { EditablePanelChip } from "src/components/Scheduling/ui";
import { ScheduleItem } from "../../types";
import cn from "src/utils/cn";
import { DistributedPlanLookups } from "./distributedPlanSelectors";
import { iconSizes } from "src/styles/designTokens";
import { assignmentAvailabilityLabel } from "src/components/Scheduling/assignmentAvailability";

export const LockToggle: React.FC<{
  locked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
}> = ({ locked, onToggle, disabled, size = "md" }) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={disabled}
    title={
      locked
        ? "Lås opp raden — kan endres om du kjører solveren på nytt"
        : "Lås raden så den forblir om du kjører solveren på nytt"
    }
    className={cn(
      "inline-flex items-center gap-1 rounded-full border font-semibold transition-colors",
      size === "sm" ? "px-1.5 py-0.5 text-nano" : "px-2 py-0.5 text-tiny",
      locked
        ? "border-brand-activeBorder bg-brand-tint text-brand hover:bg-brand-soft"
        : "border-border-soft bg-surface-base text-text-subtle hover:border-brand-strongBorder hover:text-text-primary",
      disabled && "cursor-not-allowed opacity-60",
    )}
  >
    {locked ? (
      <Lock
        size={size === "sm" ? iconSizes.nano : iconSizes.micro}
        aria-hidden="true"
      />
    ) : (
      <Unlock
        size={size === "sm" ? iconSizes.nano : iconSizes.micro}
        aria-hidden="true"
      />
    )}
    {locked ? "Låst" : "Lås"}
  </button>
);

export const BookingSourceToggle: React.FC<{
  source?: "solver" | "manual";
  onToggle: () => void;
  disabled?: boolean;
  compact?: boolean;
}> = ({ source = "solver", onToggle, disabled, compact = false }) => {
  const isManual = source === "manual";
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={isManual}
      title={
        isManual
          ? "Markert som manuelt avtalt. Trykk for å merke som solverforslag."
          : "Marker intervjuet som manuelt avtalt og lås det ved ny kjøring."
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold transition-colors",
        compact ? "px-1.5 py-0.5 text-nano" : "px-2 py-0.5 text-tiny",
        isManual
          ? "border-brand-activeBorder bg-brand-tint text-brand"
          : "border-border-soft bg-surface-base text-text-subtle hover:border-brand-strongBorder hover:text-text-primary",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <Wrench
        size={compact ? iconSizes.nano : iconSizes.micro}
        aria-hidden="true"
      />
      {isManual ? "Manuell" : "Solver"}
    </button>
  );
};

export const CandidateConflictControl: React.FC<{
  candidateName: string;
  candidateNamesVisible: boolean;
  isConflict: boolean;
  variant: "calendar" | "table";
}> = ({ candidateName, candidateNamesVisible, isConflict, variant }) => {
  if (!candidateNamesVisible) {
    return (
      <span
        className={
          variant === "calendar" ? "text-text-muted" : "text-sm text-text-muted"
        }
      >
        —
      </span>
    );
  }

  return (
    <span
      title={
        isConflict ? "Du har meldt inhabilitet for denne kandidaten" : undefined
      }
      className={
        variant === "calendar"
          ? cn(isConflict && "text-danger")
          : cn(
              "inline-flex items-center gap-1.5 text-sm font-semibold",
              isConflict ? "text-danger" : "text-text-primary",
            )
      }
    >
      {variant === "table" && isConflict && (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-danger"
        />
      )}
      {candidateName}
    </span>
  );
};

export const PanelMemberList: React.FC<{
  item: ScheduleItem;
  scheduleIndex: number;
  candidateId?: string;
  isAdmin: boolean;
  isEditableDraft: boolean;
  compact?: boolean;
  lookups: DistributedPlanLookups;
  onReplacePanelMember: (
    scheduleIndex: number,
    panelMemberIndex: number,
    replacement: { id?: string; name: string },
  ) => Promise<boolean>;
}> = ({
  item,
  scheduleIndex,
  candidateId,
  isAdmin,
  isEditableDraft,
  compact,
  lookups,
  onReplacePanelMember,
}) => (
  <div className={cn("flex flex-wrap", compact ? "gap-1" : "gap-1.5")}>
    {item.panel.map((member, panelMemberIndex) => {
      const hasConflict =
        isAdmin && candidateId
          ? (lookups.biasedFor(member)?.has(candidateId) ?? false)
          : false;
      const availabilityStatus = lookups.availabilityStatusFor(item, member);
      const availabilityLabel = assignmentAvailabilityLabel(availabilityStatus);
      return (
        <EditablePanelChip
          key={`${member.name}-${panelMemberIndex}`}
          label={member.name}
          tone={
            availabilityStatus === "outside_submitted_availability"
              ? "overtime"
              : "neutral"
          }
          conflict={hasConflict}
          isCurrentUser={lookups.isCurrentUser(member)}
          options={
            isEditableDraft || isAdmin
              ? lookups.interviewerOptions.map((interviewer) => {
                  const inPanel =
                    interviewer.id !== member.id &&
                    item.panel.some((panelMember) =>
                      panelMember.id
                        ? panelMember.id === interviewer.id
                        : panelMember.name === interviewer.name,
                    );
                  const isConflict =
                    candidateId !== undefined &&
                    (lookups
                      .biasedFor({
                        id: interviewer.id,
                        name: interviewer.name,
                      })
                      ?.has(candidateId) ??
                      false);

                  return {
                    id: interviewer.id,
                    name: interviewer.name,
                    disabled: inPanel || isConflict,
                    disabledReason: inPanel
                      ? "I panelet"
                      : isConflict
                        ? "Inhabil"
                        : undefined,
                  };
                })
              : undefined
          }
          onSelect={(newName, newId) =>
            onReplacePanelMember(scheduleIndex, panelMemberIndex, {
              id: newId,
              name: newName,
            })
          }
          title={
            hasConflict
              ? `${member.name} har meldt interessekonflikt`
              : (availabilityLabel ?? undefined)
          }
        />
      );
    })}
  </div>
);
