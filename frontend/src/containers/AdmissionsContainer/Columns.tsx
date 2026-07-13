import React from "react";
import { createColumnHelper } from "@tanstack/react-table";
import FormatTime from "src/components/Time/FormatTime";
import { ApplicationTableRow } from ".";
import { InnerTableValues } from "./InnerTable";
import DeleteApplication from "src/components/DeleteApplication";
import { ChevronDown, ChevronRight, Timer } from "lucide-react";

const columnHelper = createColumnHelper<ApplicationTableRow>();

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
      >
        {table.getIsAllRowsExpanded() ? <ChevronDown /> : <ChevronRight />}
      </button>
    ),
    size: 1,
    cell: ({ row }) => (
      <button
        type="button"
        aria-label={
          row.getIsExpanded() ? "Skjul søknadsdetaljer" : "Vis søknadsdetaljer"
        }
        aria-expanded={row.getIsExpanded()}
        onClick={() => row.toggleExpanded()}
      >
        {row.getIsExpanded() ? <ChevronDown /> : <ChevronRight />}
      </button>
    ),
  }),
  columnHelper.accessor("username", {
    header: "Brukernavn",
    size: 120,
  }),
  columnHelper.accessor("fullname", {
    header: "Fullt navn",
  }),
  columnHelper.accessor("phoneNumber", {
    header: "Tlf.",
    size: 100,
  }),
  columnHelper.accessor("email", {
    header: "E-post",
  }),
  columnHelper.accessor("createdAt", {
    header: "Sendt",
    size: 170,
    cell: (info) => (
      <>
        <FormatTime format="EEEE d. MMMM, kl. HH:mm ">
          {info.row.original.createdAt}
        </FormatTime>
        {!info.row.original.appliedWithinDeadline && (
          <Timer
            size={20}
            aria-label="Søkte etter fristen"
            className="mr-2 inline text-danger"
          />
        )}
      </>
    ),
  }),
  columnHelper.accessor("updatedAt", {
    header: "Oppdatert",
    size: 170,
    cell: (info) => (
      <>
        <FormatTime format="EEEE d. MMMM, kl. HH:mm">
          {info.row.original.updatedAt}
        </FormatTime>
      </>
    ),
  }),
  columnHelper.accessor("numApplications", {
    header: "Søknader",
    size: 70,
    cell: (info) => info.row.original.numApplications,
  }),
];

const innerColumnHelper = createColumnHelper<InnerTableValues>();

export const innerColumns = [
  innerColumnHelper.accessor("groupName", {
    header: "Gruppe",
    size: 100,
  }),
  innerColumnHelper.accessor("text", {
    header: "Søknadstekst",
    size: 800,
  }),
  innerColumnHelper.display({
    id: "actions",
    header: () => "Handlinger",
    cell: ({ row }) => (
      <DeleteApplication
        applicationId={row.original.applicationId}
        groupId={row.original.groupId}
      />
    ),
    size: 160,
  }),
];
