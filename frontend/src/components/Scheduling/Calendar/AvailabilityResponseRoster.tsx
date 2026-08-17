import React from "react";
import { Chip } from "src/components/ui";
import type { InterviewAvailabilityParticipant } from "src/types";
import cn from "src/utils/cn";

interface AvailabilityResponseRosterProps {
  participants: InterviewAvailabilityParticipant[];
  className?: string;
}

const displayName = (participant: InterviewAvailabilityParticipant) =>
  participant.full_name || participant.username;

const byName = (
  a: InterviewAvailabilityParticipant,
  b: InterviewAvailabilityParticipant,
) => displayName(a).localeCompare(displayName(b), "nb");

/**
 * Names every interviewer in the committee and what they have answered.
 *
 * The surrounding stage only reports a count, which tells an admin that someone
 * is missing but not who to go and ask.
 */
const AvailabilityResponseRoster: React.FC<AvailabilityResponseRosterProps> = ({
  participants,
  className,
}) => {
  const { missing, submitted, notParticipating } = React.useMemo(() => {
    const missing: InterviewAvailabilityParticipant[] = [];
    const submitted: InterviewAvailabilityParticipant[] = [];
    const notParticipating: InterviewAvailabilityParticipant[] = [];
    for (const participant of participants) {
      if (participant.participation === "not_participating") {
        notParticipating.push(participant);
      } else if (participant.has_submitted) {
        submitted.push(participant);
      } else {
        missing.push(participant);
      }
    }
    return {
      missing: missing.sort(byName),
      submitted: submitted.sort(byName),
      notParticipating: notParticipating.sort(byName),
    };
  }, [participants]);

  if (participants.length === 0) return null;

  const renderGroup = (
    label: string,
    group: InterviewAvailabilityParticipant[],
    tone: React.ComponentProps<typeof Chip>["tone"],
    dataCy: string,
  ) => {
    if (group.length === 0) return null;
    return (
      <div className="flex flex-col gap-1.5" data-cy={dataCy}>
        <p className="m-0 text-detail font-semibold text-text-muted">
          {label} ({group.length})
        </p>
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {group.map((participant) => (
            <li key={participant.user_id}>
              <Chip tone={tone}>
                {displayName(participant)}
                {participant.is_me && (
                  <span className="font-normal opacity-70">(deg)</span>
                )}
              </Chip>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <section
      aria-label="Svar fra intervjuere"
      data-cy="availability-response-roster"
      className={cn("flex flex-col gap-3", className)}
    >
      {missing.length === 0 ? (
        <p
          className="m-0 text-detail font-semibold text-success"
          data-cy="availability-roster-all-answered"
        >
          Alle i komiteen har svart.
        </p>
      ) : (
        renderGroup("Mangler svar", missing, "warning", "availability-missing")
      )}
      {renderGroup("Har svart", submitted, "success", "availability-submitted")}
      {renderGroup(
        "Deltar ikke",
        notParticipating,
        "muted",
        "availability-not-participating",
      )}
    </section>
  );
};

export default AvailabilityResponseRoster;
