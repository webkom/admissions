import React from "react";
import Icon from "src/components/Icon";
import FormatTime from "src/components/Time/FormatTime";

export const cols = [
  {
    id: "expander",
    Header: ({ getToggleAllRowsExpandedProps, isAllRowsExpanded }) => (
      <span {...getToggleAllRowsExpandedProps()}>
        {isAllRowsExpanded ? "▲" : "▼"}
      </span>
    ),
    Cell: ({ row }) => (
      <span {...row.getToggleRowExpandedProps()}>
        {row.isExpanded ? "▲" : "▼"}
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
    accessor: "phone_number",
  },
  {
    Header: "E-mail",
    accessor: "email",
  },
  {
    Header: "Sendt",
    Cell: (props) => {
      return (
        <>
          <FormatTime format="EEEE d. MMMM, kl. HH:mm ">
            {props.row.original.created_at}
          </FormatTime>
          {(!props.row.original.applied_within_deadline && (
            <Icon
              name="stopwatch"
              iconPrefix="ios"
              size="1.5rem"
              title="Søkte etter fristen"
              color="#c0392b"
              padding="0 10px 0 0"
            />
          )) ||
            ""}
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
            {props.row.original.updated_at}
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

export const innerCols = [
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
