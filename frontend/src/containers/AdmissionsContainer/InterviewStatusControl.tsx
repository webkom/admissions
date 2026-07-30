import React from "react";
import { DateTime } from "luxon";
import { CustomSelect } from "src/components/ui";
import { useAdminUpdateInterviewStatusMutation } from "src/query/mutations";
import { isSensitiveAuthorityChangedError } from "src/query/sensitiveAccess";
import type { InterviewStatus } from "src/types";
import { getApiErrorMessage } from "src/utils/apiErrors";
import cn from "src/utils/cn";
import {
  getInterviewStatusLabel,
  getInterviewStatusTone,
  interviewStatusOptions,
  type InterviewStatusTone,
} from "src/utils/interviewStatus";

const interviewStatusDotTone: Record<InterviewStatusTone, string> = {
  neutral: "bg-text-faded",
  info: "bg-amber-500",
  success: "bg-success",
  danger: "bg-danger",
};

interface InterviewStatusControlProps {
  admissionSlug: string;
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
  applicationId,
  candidateName,
  status,
  statusUpdatedAt,
  statusUpdatedBy,
  canEdit,
  compact = false,
}) => {
  const mutation = useAdminUpdateInterviewStatusMutation(admissionSlug);
  const feedbackId = React.useId();
  const statusLabel = getInterviewStatusLabel(status);
  const tone = getInterviewStatusTone(status);
  const parsedUpdatedAt = DateTime.fromISO(statusUpdatedAt).setLocale("nb");
  const updatedAt = parsedUpdatedAt.isValid
    ? parsedUpdatedAt.toFormat("d. MMM HH:mm")
    : "ukjent tidspunkt";
  const statusExplanation = `Intervjustatus: ${statusLabel}. Status endret ${updatedAt}${
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
          className="inline-flex min-h-control-sm items-center gap-2 text-detail font-semibold text-text-primary"
        >
          <span
            aria-hidden="true"
            className={cn(
              "h-2.5 w-2.5 flex-none rounded-full",
              interviewStatusDotTone[tone],
            )}
          />
          {statusLabel}
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
        <span
          aria-hidden="true"
          className={cn(
            "h-2.5 w-2.5 flex-none rounded-full",
            interviewStatusDotTone[tone],
          )}
        />
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
            "[&>button]:rounded-md [&>button]:bg-transparent [&>button]:hover:bg-surface-subtle",
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
