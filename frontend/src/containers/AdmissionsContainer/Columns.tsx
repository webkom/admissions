import React from "react";
import { createColumnHelper } from "@tanstack/react-table";
import FormatTime from "src/components/Time/FormatTime";
import { ApplicationTableRow } from ".";
import {
  ChevronDown,
  ChevronRight,
  MessageCircle,
  Phone,
  Timer,
} from "lucide-react";
import InterviewStatusControl, {
  compareInterviewStatuses,
} from "./InterviewStatusControl";
import {
  applicationTableColumnWidths,
  iconSizes,
} from "src/styles/designTokens";
import { encodeSmsAddress } from "src/utils/emailLinks";

const columnHelper = createColumnHelper<ApplicationTableRow>();

const formatGroupNames = (groupNames: string[]): string => {
  if (groupNames.length <= 2) return groupNames.join(" · ");
  return `${groupNames.slice(0, 2).join(" · ")} +${groupNames.length - 2}`;
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
        <span className="text-detail text-text-muted">
          @{row.original.username}
        </span>
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
  columnHelper.accessor("interviewStatus", {
    header: "Intervju",
    size: applicationTableColumnWidths.status,
    sortingFn: (firstRow, secondRow) =>
      compareInterviewStatuses(
        firstRow.original.interviewStatus,
        secondRow.original.interviewStatus,
      ),
    cell: ({ row, getValue }) => (
      <InterviewStatusControl
        admissionSlug={row.original.admissionSlug}
        applicationId={row.original.id}
        candidateName={row.original.fullname}
        status={getValue()}
        statusUpdatedAt={row.original.interviewStatusUpdatedAt}
        statusUpdatedBy={row.original.interviewStatusUpdatedBy}
        canEdit={row.original.canUpdateInterviewStatus}
        compact
      />
    ),
  }),
  columnHelper.accessor("createdAt", {
    header: "Sendt",
    size: applicationTableColumnWidths.timestamp,
    cell: (info) => (
      <>
        <span className="tabular-nums whitespace-nowrap">
          <FormatTime format="d. MMM HH:mm">
            {info.row.original.createdAt}
          </FormatTime>
        </span>
        {!info.row.original.appliedWithinDeadline && (
          <Timer
            size={iconSizes.control}
            aria-label="Søkte etter fristen"
            className="ml-1.5 inline text-danger"
          />
        )}
      </>
    ),
  }),
];
