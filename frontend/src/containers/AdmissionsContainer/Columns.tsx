import React from "react";
import { createColumnHelper } from "@tanstack/react-table";
import Icon from "src/components/Icon";
import FormatTime from "src/components/Time/FormatTime";
import { AdmissionsTableValues } from ".";
import { InnerTableValues } from "./InnerTable";
import DeleteApplication from "src/components/Application/DeleteApplication";

const columnHelper = createColumnHelper<AdmissionsTableValues>();

export const columns = [
  columnHelper.display({
    id: "expander",
    header: ({ table }) => (
      <span onClick={table.getToggleAllRowsExpandedHandler()}>
        {table.getIsAllRowsExpanded() ? "▼" : "►"}
      </span>
    ),
    size: 1,
    cell: ({ row }) => (
      <span onClick={() => row.toggleExpanded()}>
        {row.getIsExpanded() ? "▼" : "►"}
      </span>
    ),
  }),
  columnHelper.accessor("username", {
    header: "Brukernavn",
  }),
  columnHelper.accessor("fullname", {
    header: "Fullt navn",
  }),
  columnHelper.accessor("phoneNumber", {
    header: "Tlf.",
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
          <Icon
            name="stopwatch"
            prefix="ios"
            size="1.5rem"
            title="Søkte etter fristen"
            color="#c0392b"
            padding="0 10px 0 0"
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
    size: 1,
    cell: (info) => info.row.original.numApplications,
  }),
];

const innerColumnHelper = createColumnHelper<InnerTableValues>();

export const innerColumns = [
  innerColumnHelper.accessor("group", {
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
        groupName={row.original.group}
      />
    ),
    size: 100,
  }),
];
