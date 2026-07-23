import React, { useState } from "react";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import cn from "src/utils/cn";
import { iconSizes } from "src/styles/designTokens";
import {
  SchedulePanel,
  SchedulePanelHeader,
  SchedulePanelBody,
  Chip,
  actionButtonBase,
  actionButtonNeutral,
} from "src/components/Scheduling/ui";
import { InterviewAvailabilityParticipant } from "../../types";

interface AvailabilityStatusPanelProps {
  participants: InterviewAvailabilityParticipant[];
  isLoading?: boolean;
}

const AvailabilityStatusPanel: React.FC<AvailabilityStatusPanelProps> = ({
  participants,
  isLoading = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const submitted = participants
    .filter((participant) => participant.has_submitted)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "nb"));
  const missing = participants
    .filter((participant) => !participant.has_submitted)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "nb"));
  const needsReviewCount = missing.filter(
    (participant) => participant.needs_review,
  ).length;
  const complete = participants.length > 0 && missing.length === 0;

  if (complete) {
    return (
      <SchedulePanel>
        <SchedulePanelBody className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-success-border bg-success-bg text-success">
                <Check size={iconSizes.medium} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="m-0 text-sm font-bold text-text-primary">
                  Alle har sendt inn tilgjengelighet
                </h2>
                <p className="m-0 mt-0.5 text-detail text-text-muted">
                  {submitted.length} av {participants.length} svar mottatt
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((current) => !current)}
              className={cn(actionButtonBase, actionButtonNeutral)}
            >
              {expanded ? "Skjul svar" : "Vis svar"}
              <ChevronDown
                size={iconSizes.small}
                aria-hidden="true"
                className={cn(
                  "transition-transform duration-150",
                  expanded && "rotate-180",
                )}
              />
            </button>
          </div>
          {expanded && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-border-soft pt-3">
              {submitted.map((participant) => (
                <ParticipantChip
                  key={participant.user_id}
                  participant={participant}
                  tone="success"
                />
              ))}
            </div>
          )}
        </SchedulePanelBody>
      </SchedulePanel>
    );
  }

  return (
    <SchedulePanel>
      <SchedulePanelHeader
        icon={CalendarRange}
        title="Status på tilgjengelighet"
        description="Følg opp intervjuere som ikke har sendt inn eller må bekrefte et endret tidsoppsett."
        chips={
          <Chip
            tone={
              participants.length === 0
                ? "muted"
                : missing.length === 0
                  ? "success"
                  : "warning"
            }
          >
            {submitted.length}/{participants.length}
          </Chip>
        }
      />
      <SchedulePanelBody className="flex flex-col gap-4">
        {participants.length === 0 ? (
          <p className="m-0 text-ui text-text-muted">
            {isLoading
              ? "Henter status for tilgjengelighet…"
              : "Ingen intervjuere har blitt invitert ennå."}
          </p>
        ) : (
          <>
            <div>
              <span className="mb-2 block text-ui font-semibold text-amber-800">
                Mangler ({missing.length})
              </span>
              {needsReviewCount > 0 && (
                <p className="m-0 mb-2 text-detail text-text-muted">
                  {needsReviewCount} må bekrefte tilgjengeligheten på nytt.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {missing.map((participant) => (
                  <ParticipantChip
                    key={participant.user_id}
                    participant={participant}
                    tone="warning"
                  />
                ))}
              </div>
            </div>
            {submitted.length > 0 && (
              <details>
                <summary className="cursor-pointer text-ui font-semibold text-text-muted hover:text-text-primary">
                  Vis innsendte svar ({submitted.length})
                </summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {submitted.map((participant) => (
                    <ParticipantChip
                      key={participant.user_id}
                      participant={participant}
                      tone="success"
                    />
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </SchedulePanelBody>
    </SchedulePanel>
  );
};

const ParticipantChip: React.FC<{
  participant: InterviewAvailabilityParticipant;
  tone: "success" | "warning";
}> = ({ participant, tone }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold",
      tone === "success"
        ? "border-success-border bg-success-bg text-text-primary"
        : "border-amber-200 bg-amber-50 text-amber-900",
    )}
  >
    <span
      className={cn(
        "h-2 w-2 rounded-full",
        tone === "success" ? "bg-success" : "bg-amber-500",
      )}
    />
    {participant.full_name}
    {participant.has_submitted && (
      <span className="text-detail font-medium text-text-muted">
        · {participant.slots.length} tider
      </span>
    )}
    {participant.needs_review && (
      <span className="text-detail font-medium text-amber-800">
        · må bekrefte på nytt
      </span>
    )}
  </span>
);

export default AvailabilityStatusPanel;
