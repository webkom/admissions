import React, { useMemo } from "react";
import { useTable, useSortBy, useExpanded } from "react-table";
import { columns as cols } from "./Columns";
import AdmissionsInnerTable from "./InnerTable";
import SubComponentWrapper from "./SubComponentWrapper";
import SubComponentHeader from "./SubComponentHeader";

const AdmissionsContainer = ({ applications }) => {
  const columns = useMemo(() => cols, []);
  const data = useMemo(
    () =>
      applications.map((application) => ({
        username: application.user.username,
        fullname: application.user.full_name,
        phoneNumber: application.phone_number,
        email: application.user.email,
        appliedWithinDeadline: application.applied_within_deadline,
        numApplications: application.group_applications.length,
        createdAt: application.created_at,
        updatedAt: application.updated_at,
        text: application.text,
        groupApplications: application.group_applications.map(
          (application) => ({
            group: application.group.name,
            text: application.text,
          })
        ),
      })),
    [applications]
  );

  const tableInstance = useTable({ columns, data }, useSortBy, useExpanded);
  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow,
    visibleColumns,
  } = tableInstance;

  const subComponent = React.useCallback(
    ({ row }) => (
      <>
        <SubComponentWrapper>
          <SubComponentHeader>Prioriteringstekst</SubComponentHeader>
          <p>{row.original.text}</p>
          <SubComponentHeader>Søknader</SubComponentHeader>
          <AdmissionsInnerTable
            groupApplications={row.original.groupApplications}
          />
        </SubComponentWrapper>
      </>
    ),
    [applications]
  );

  return (
    <div>
      <table {...getTableProps()}>
        <thead>
          {headerGroups.map((headerGroup) => (
            <tr key={headerGroup} {...headerGroup.getHeaderGroupProps()}>
              {headerGroup.headers.map((column) => (
                <th key={column} {...column.getHeaderProps()}>
                  {column.render("Header")}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody {...getTableBodyProps()}>
          {rows.map((row) => {
            prepareRow(row);
            return (
              <React.Fragment key={row} {...row.getRowProps()}>
                <tr>
                  {row.cells.map((cell) => {
                    return (
                      <td key={cell} {...cell.getCellProps()}>
                        {cell.render("Cell")}
                      </td>
                    );
                  })}
                </tr>
                {row.isExpanded ? (
                  <tr>
                    <td colSpan={visibleColumns.length}>
                      {subComponent({ row })}
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default AdmissionsContainer;
