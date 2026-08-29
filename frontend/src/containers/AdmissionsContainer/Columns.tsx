import React from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { ApplicationTableRow } from ".";
import { ChevronDown, ChevronRight, MessageCircle, Phone } from "lucide-react";
import InterviewStatusControl, {
  compareInterviewStatuses,
} from "./InterviewStatusControl";
import {
  applicationTableColumnWidths,
  iconSizes,
} from "src/styles/designTokens";
import { encodeSmsAddress } from "src/utils/emailLinks";
import { getApplicationDeadlineStatus } from "src/utils/applicationAccess";
import FormatTime from "src/components/Time/FormatTime";
import { DateTime } from "luxon";

const columnHelper = createColumnHelper<ApplicationTableRow>();

const formatGroupNames = (groupNames: string[]): string => {
  if (groupNames.length <= 2) return groupNames.join(", ");
  return `${groupNames.slice(0, 2).join(", ")} +${groupNames.length - 2}`;
};

export const columns = [
  columnHelper.display({
    id: "expander",
    header: ({ table }) => (
      <button
        type="button"
        aria-label={
          table.getIsAllRowsExpanded()
            ? "Skjul alle søknadsdetaljer"
            : "Vis alle søknadsdetaljer"
        }
        aria-expanded={table.getIsAllRowsExpanded()}
        onClick={table.getToggleAllRowsExpandedHandler()}
        title={
          table.getIsAllRowsExpanded()
            ? "Skjul alle søknadsdetaljer"
            : "Vis alle søknadsdetaljer"
        }
        className="rounded-sm p-1 text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft"
      >
        {table.getIsAllRowsExpanded() ? (
          <ChevronDown size={iconSizes.medium} />
        ) : (
          <ChevronRight size={iconSizes.medium} />
        )}
      </button>
    ),
    size: applicationTableColumnWidths.expander,
    cell: ({ row }) => (
      <button
        type="button"
        aria-label={
          row.getIsExpanded() ? "Skjul søknadsdetaljer" : "Vis søknadsdetaljer"
        }
        aria-expanded={row.getIsExpanded()}
        onClick={() => row.toggleExpanded()}
        className="rounded-sm p-1 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft"
      >
        {row.getIsExpanded() ? (
          <ChevronDown size={iconSizes.medium} />
        ) : (
          <ChevronRight size={iconSizes.medium} />
        )}
      </button>
    ),
  }),
  columnHelper.accessor("fullname", {
    header: "Søker",
    enableSorting: false,
    size: applicationTableColumnWidths.identity,
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-semibold text-text-primary">
          {row.original.fullname}
        </span>
        {row.original.username && (
          <span className="text-detail text-text-muted">
            @{row.original.username}
          </span>
        )}
      </div>
    ),
  }),
  columnHelper.accessor("phoneNumber", {
    header: "Kontakt",
    size: applicationTableColumnWidths.contact,
    cell: ({ getValue, row }) => {
      const phoneNumber = getValue().trim();
      const phoneRecipient = encodeSmsAddress(phoneNumber);
      if (!phoneRecipient) return "—";

      return (
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-text-primary">
            {phoneNumber}
          </span>
          <a
            href={`tel:${phoneRecipient}`}
            aria-label={`Ring ${row.original.fullname}`}
            title={`Ring ${row.original.fullname}`}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border-soft text-text-primary hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft"
          >
            <Phone size={iconSizes.compact} aria-hidden="true" />
          </a>
          <a
            href={`sms:${phoneRecipient}`}
            aria-label={`Send melding til ${row.original.fullname}`}
            title={`Send melding til ${row.original.fullname}`}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border-soft text-text-primary hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft"
          >
            <MessageCircle size={iconSizes.compact} aria-hidden="true" />
          </a>
        </div>
      );
    },
  }),
  columnHelper.accessor("groupNames", {
    id: "groupNames",
    header: "Søker til",
    size: applicationTableColumnWidths.group,
    sortingFn: (firstRow, secondRow) =>
      firstRow.original.groupNames
        .join(" ")
        .localeCompare(secondRow.original.groupNames.join(" "), "nb"),
    cell: ({ getValue }) => {
      const groupNames = getValue();
      return (
        <span
          className="block max-w-44 text-ui text-text-primary"
          title={groupNames.join(", ")}
        >
          {formatGroupNames(groupNames)}
        </span>
      );
    },
  }),
  columnHelper.accessor("interviewStatuses", {
    header: "Intervju",
    size: applicationTableColumnWidths.status,
    sortingFn: (firstRow, secondRow) =>
      compareInterviewStatuses(
        firstRow.original.interviewStatuses[0]?.interviewStatus ??
          "not_invited",
        secondRow.original.interviewStatuses[0]?.interviewStatus ??
          "not_invited",
      ),
    cell: ({ row, getValue }) => {
      const cells = getValue();
      if (cells.length === 0) return null;
      // Status is per committee. One applicant applying to several committees
      // gets one control per committee, each labelled.
      return (
        <div className="flex min-w-0 flex-col gap-1.5">
          {cells.map((cell) => (
            <div key={cell.groupId} className="flex min-w-0 flex-col gap-0.5">
              {cells.length > 1 && (
                <span className="text-nano font-semibold text-text-muted">
                  {cell.groupName}
                </span>
              )}
              <InterviewStatusControl
                admissionSlug={row.original.admissionSlug}
                groupId={cell.groupId}
                applicationScopeKey={row.original.applicationScopeKey}
                applicationId={row.original.id}
                candidateName={row.original.fullname}
                status={cell.interviewStatus}
                statusUpdatedAt={cell.interviewStatusUpdatedAt}
                statusUpdatedBy={cell.interviewStatusUpdatedBy ?? ""}
                canEdit={row.original.canUpdateInterviewStatus}
                compact
              />
            </div>
          ))}
        </div>
      );
    },
  }),
  columnHelper.accessor("createdAt", {
    header: "Sendt",
    size: applicationTableColumnWidths.timestamp,
    cell: (info) => {
      const createdAt = info.row.original.createdAt;
      if (!createdAt) return null;
      const isWithinDeadline = info.row.original.appliedWithinDeadline;
      const fullTimestamp = DateTime.fromISO(createdAt)
        .setLocale("nb")
        .toFormat("EEEE d. MMMM yyyy, kl. HH:mm");

      return (
        <div
          title={`Sendt: ${fullTimestamp}`}
          className="flex min-w-0 flex-col gap-0.5 leading-tight"
        >
          <div className="flex items-center gap-1.5 tabular-nums whitespace-nowrap text-ui">
            <span className="font-medium text-text-primary">
              <FormatTime format="d. LLL">{createdAt}</FormatTime>
            </span>
            <span className="text-xs text-text-muted/60">–</span>
            <span className="text-text-muted">
              <FormatTime format="HH:mm">{createdAt}</FormatTime>
            </span>
          </div>
          <span
            data-cy="application-sent-time"
            data-late={!isWithinDeadline}
            className={`text-detail font-medium tabular-nums whitespace-nowrap ${
              isWithinDeadline ? "text-success" : "text-orange-500"
            }`}
          >
            {getApplicationDeadlineStatus(isWithinDeadline)}
          </span>
        </div>
      );
    },
  }),
];
