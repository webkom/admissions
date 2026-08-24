import React from "react";
import { DateTime } from "luxon";
import { Copy } from "lucide-react";
import { Chip } from "src/components/ui";
import { keyboardFocusRingClass } from "src/components/Scheduling/ui";
import { iconSizes } from "src/styles/designTokens";
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

const answeredLabel = (participant: InterviewAvailabilityParticipant) => {
  if (!participant.availability_updated_at) return null;
  const answered = DateTime.fromISO(
    participant.availability_updated_at,
  ).setLocale("nb");
  return answered.isValid ? answered.toRelative() : null;
};

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

  const [copyState, setCopyState] = React.useState<
    "idle" | "copied" | "failed"
  >("idle");
  React.useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 4000);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  if (participants.length === 0) return null;

  const copyableAddresses = missing
    .map((participant) => participant.email)
    .filter((email): email is string => Boolean(email));
  // Split out rather than merely labelled: these two need different things
  // from the person chasing them. One has an account and has not filled in
  // their times; the other has never opened opptak at all, and appears here
  // only because LEGO says they are in the committee.
  const neverSignedIn = missing.filter(
    (participant) => participant.has_signed_in === false,
  );

  const copyMissingAddresses = async () => {
    try {
      await navigator.clipboard.writeText(copyableAddresses.join(", "));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const renderGroup = (
    label: string,
    group: InterviewAvailabilityParticipant[],
    tone: React.ComponentProps<typeof Chip>["tone"],
    dataCy: string,
    showAnswered = false,
  ) => {
    if (group.length === 0) return null;
    return (
      <div className="flex flex-col gap-1.5" data-cy={dataCy}>
        <p className="m-0 text-detail font-semibold text-text-muted">
          {label} ({group.length})
        </p>
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {group.map((participant) => {
            const answered = showAnswered ? answeredLabel(participant) : null;
            return (
              <li key={participant.user_id}>
                <Chip tone={tone}>
                  {displayName(participant)}
                  {participant.is_me && (
                    <span className="font-normal opacity-70">(deg)</span>
                  )}
                  {answered && (
                    <span className="font-normal opacity-70">{answered}</span>
                  )}
                </Chip>
              </li>
            );
          })}
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
        <div className="flex flex-col gap-1.5">
          {renderGroup(
            "Mangler svar",
            missing,
            "warning",
            "availability-missing",
          )}
          {neverSignedIn.length > 0 && (
            <p
              className="m-0 text-detail text-text-muted"
              data-cy="availability-never-signed-in"
            >
              {neverSignedIn.length === 1
                ? "1 av disse har aldri logget inn i opptak."
                : `${neverSignedIn.length} av disse har aldri logget inn i opptak.`}{" "}
              De er hentet fra komiteen i LEGO, så be dem logge inn – eller
              marker dem som «deltar ikke».
            </p>
          )}
          {copyableAddresses.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copyMissingAddresses()}
                data-cy="copy-missing-emails"
                className={cn(
                  "inline-flex items-center gap-1.5 self-start rounded-full border border-border-soft px-2.5 py-1 text-detail font-semibold text-text-muted hover:bg-surface-subtle",
                  keyboardFocusRingClass,
                )}
              >
                <Copy size={iconSizes.detail} aria-hidden="true" />
                Kopier e-postliste ({copyableAddresses.length})
              </button>
              <span aria-live="polite" className="text-detail text-text-muted">
                {copyState === "copied" && "Kopiert."}
                {copyState === "failed" && "Kunne ikke kopiere."}
              </span>
            </div>
          )}
        </div>
      )}
      {renderGroup(
        "Har svart",
        submitted,
        "success",
        "availability-submitted",
        true,
      )}
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
