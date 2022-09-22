import React from "react";
import Icon from "src/components/Icon";
import FormatTime from "src/components/Time/FormatTime";

export const columns = [
  {
    id: "expander",
    Header: ({ getToggleAllRowsExpandedProps, isAllRowsExpanded }) => (
      <span {...getToggleAllRowsExpandedProps()}>
        {isAllRowsExpanded ? "▼" : "►"}
      </span>
    ),
    Cell: ({ row }) => (
      <span {...row.getToggleRowExpandedProps()}>
        {row.isExpanded ? "▼" : "►"}
      </span>
    ),
  },
  {
    Header: "Brukernavn",
    accessor: "username",
  },
  {
    Header: "Fullt navn",
    accessor: "fullname",
  },
  {
    Header: "Tlf.",
    accessor: "phoneNumber",
  },
  {
    Header: "E-post",
    accessor: "email",
  },
  {
    Header: "Sendt",
    Cell: (props) => {
      return (
        <>
          <FormatTime format="EEEE d. MMMM, kl. HH:mm ">
            {props.row.original.createdAt}
          </FormatTime>
          {(!props.row.original.appliedWithinDeadline && (
            <Icon
              name="stopwatch"
              iconPrefix="ios"
              size="1.5rem"
              title="Søkte etter fristen"
              color="#c0392b"
              padding="0 10px 0 0"
            />
          ))}
        </>
      );
    },
  },
  {
    Header: "Oppdatert",
    Cell: (props) => {
      return (
        <>
          <FormatTime format="EEEE d. MMMM, kl. HH:mm">
            {props.row.original.updatedAt}
          </FormatTime>
        </>
      );
    },
  },
  {
    Header: "Søknader",
    Cell: (props) => {
      return <>{props.row.original.numApplications}</>;
    },
  },
];

export const innerColumns = [
  {
    Header: "Gruppe",
    accessor: "group",
  },
  {
    Header: "Søknadstekst",
    accessor: "text",
    width: 600,
  },
];
