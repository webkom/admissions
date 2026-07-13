import React from "react";
import { CalendarRange } from "lucide-react";
import {
  SchedulePanel,
  SchedulePanelHeader,
  SchedulePanelBody,
  Chip,
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
  const submitted = participants
    .filter((p) => p.has_submitted)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "nb"));
  const missing = participants
    .filter((p) => !p.has_submitted)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "nb"));

  return (
    <SchedulePanel>
      <SchedulePanelHeader
        icon={CalendarRange}
        title="Status på tilgjengelighet"
        description="Se hvem som har sendt inn tilgjengelighet og hvem som mangler."
        chips={
          <Chip tone={missing.length === 0 ? "success" : "muted"}>
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
              <span className="mb-2 block text-ui font-semibold text-success">
                Sendt inn ({submitted.length})
              </span>
              {submitted.length === 0 ? (
                <span className="text-ui text-text-muted">Ingen ennå.</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {submitted.map((p) => (
                    <span
                      key={p.user_id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-success-border bg-success-bg px-3 py-1.5 text-sm font-semibold text-text-primary"
                    >
                      <span className="h-2 w-2 rounded-full bg-success" />
                      {p.full_name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <span className="mb-2 block text-ui font-semibold text-text-muted">
                Mangler ({missing.length})
              </span>
              {missing.length === 0 ? (
                <span className="text-ui text-text-muted">
                  Alle har sendt inn.
                </span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {missing.map((p) => (
                    <span
                      key={p.user_id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border-soft bg-surface-base px-3 py-1.5 text-sm font-semibold text-text-muted"
                    >
                      <span className="h-2 w-2 rounded-full bg-text-disabled" />
                      {p.full_name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </SchedulePanelBody>
    </SchedulePanel>
  );
};

export default AvailabilityStatusPanel;
