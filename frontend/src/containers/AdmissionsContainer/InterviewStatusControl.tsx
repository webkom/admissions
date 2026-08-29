import React from "react";
import { DateTime } from "luxon";
import { Chip, CustomSelect } from "src/components/ui";
import { useAdminUpdateInterviewStatusMutation } from "src/query/mutations";
import { isSensitiveAuthorityChangedError } from "src/query/sensitiveAccess";
import type { InterviewStatus } from "src/types";
import { getApiErrorMessage } from "src/utils/apiErrors";
import cn from "src/utils/cn";
import {
  compareInterviewStatuses,
  getInterviewStatusLabel,
  getInterviewStatusTone,
  interviewStatusOptions,
  type InterviewStatusTone,
} from "src/utils/interviewStatus";

export const interviewStatusChipTone: Record<
  InterviewStatusTone,
  React.ComponentProps<typeof Chip>["tone"]
> = {
  neutral: "muted",
  info: "warning",
  success: "success",
  danger: "danger",
};

// The editable control already shows the label inside the select, so the status
// reads as a tinted trigger rather than a second chip beside it.
const interviewStatusTriggerTone: Record<InterviewStatusTone, string> = {
  neutral:
    "[&>button]:border-border-soft [&>button]:bg-surface-subtle [&>button]:text-text-muted",
  info: "[&>button]:border-amber-300 [&>button]:bg-amber-100 [&>button]:text-amber-900",
  success:
    "[&>button]:border-success-border [&>button]:bg-success-bg [&>button]:text-success",
  danger:
    "[&>button]:border-danger-border [&>button]:bg-danger-bg [&>button]:text-danger",
};

export { compareInterviewStatuses };

interface InterviewStatusControlProps {
  admissionSlug: string;
  /** Only known when rendered from within one committee's own schedule page
   * - keeps that committee's schedule cache entry optimistically in sync.
   * The admin applications list spans every committee, so it has none. */
  groupId?: string;
  applicationScopeKey?: string;
  applicationId: string;
  candidateName: string;
  status: InterviewStatus;
  statusUpdatedAt: string;
  statusUpdatedBy: string;
  canEdit: boolean;
  compact?: boolean;
}

const InterviewStatusControl: React.FC<InterviewStatusControlProps> = ({
  admissionSlug,
  groupId,
  applicationScopeKey = "schedule",
  applicationId,
  candidateName,
  status,
  statusUpdatedAt,
  statusUpdatedBy,
  canEdit,
  compact = false,
}) => {
  const mutation = useAdminUpdateInterviewStatusMutation(
    admissionSlug,
    applicationScopeKey,
    groupId,
  );
  const feedbackId = React.useId();
  const statusLabel = getInterviewStatusLabel(status);
  const tone = getInterviewStatusTone(status);
  const parsedUpdatedAt = DateTime.fromISO(statusUpdatedAt).setLocale("nb");
  const updatedAt = parsedUpdatedAt.isValid
    ? parsedUpdatedAt.toFormat("d. MMM HH:mm")
    : "ukjent tidspunkt";
  const statusExplanation = `Intervjustatus for ${candidateName}: ${statusLabel}. Status endret ${updatedAt}${
    statusUpdatedBy ? ` av ${statusUpdatedBy}` : ""
  }${canEdit ? ". Klikk for å endre" : ""}`;

  let feedback: string | null = null;
  if (mutation.isPending) {
    feedback = "Lagrer status …";
  } else if (
    mutation.isError &&
    !isSensitiveAuthorityChangedError(mutation.error)
  ) {
    switch (mutation.error.response?.status) {
      case 400:
        feedback =
          "Statusen er ikke gyldig. Den forrige statusen er gjenopprettet.";
        break;
      case 404:
        feedback = "Søknaden er ikke lenger tilgjengelig. Listen oppdateres.";
        break;
      case 409:
        feedback =
          "Statusen ble endret av noen andre. Den nyeste statusen lastes inn.";
        break;
      default:
        feedback = getApiErrorMessage(
          mutation.error,
          "Kunne ikke lagre statusen. Den forrige statusen er gjenopprettet.",
        );
    }
  }

  if (!canEdit) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <span
          aria-label={statusExplanation}
          title={statusExplanation}
          className="inline-flex min-h-control-sm items-center"
        >
          <Chip tone={interviewStatusChipTone[tone]}>{statusLabel}</Chip>
        </span>
        {statusUpdatedAt && (
          <span className="text-detail leading-tight text-text-muted">
            Status endret {updatedAt}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", compact && "w-full")}>
      <div
        className="flex w-full min-w-0 items-center gap-2"
        title={compact ? statusExplanation : undefined}
      >
        <CustomSelect
          value={status}
          onChange={(nextStatus) => {
            mutation.mutate({
              applicationId,
              interviewStatus: nextStatus as InterviewStatus,
              expectedInterviewStatusUpdatedAt: statusUpdatedAt,
            });
          }}
          options={interviewStatusOptions}
          disabled={mutation.isPending}
          compact={compact}
          className={cn(
            compact ? "min-w-0 flex-1" : "w-full",
            "[&>button]:rounded-full",
            interviewStatusTriggerTone[tone],
          )}
          aria-label={`Intervjustatus for ${candidateName}: ${statusLabel}`}
          aria-describedby={feedback ? feedbackId : undefined}
          aria-busy={mutation.isPending}
        />
      </div>
      {feedback && (
        <span
          id={feedbackId}
          role={mutation.isError ? "alert" : "status"}
          className={cn(
            "max-w-xs text-detail leading-tight",
            compact && !mutation.isError && "sr-only",
            mutation.isError ? "text-danger" : "text-text-muted",
          )}
        >
          {feedback}
        </span>
      )}
      {!feedback && statusUpdatedAt && (
        <span className="text-detail leading-tight text-text-muted">
          Status endret {updatedAt}
        </span>
      )}
    </div>
  );
};

export default InterviewStatusControl;
