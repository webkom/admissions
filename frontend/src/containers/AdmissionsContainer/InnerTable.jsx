import React, { useMemo } from "react";
import { useTable, useSortBy, useBlockLayout } from "react-table";
import { innerColumns } from "./Columns";

const AdmissionsInnerTable = ({ groupApplications }) => {
  const columns = useMemo(() => innerColumns, []);
  const data = useMemo(
    () =>
      groupApplications.map(() => ({
        group: groupApplications.group,
        text: groupApplications.text,
      })),
    [groupApplications]
  );

  const tableInstance = useTable({ columns, data }, useSortBy, useBlockLayout);
  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } =
    tableInstance;

  return (
    <div>
      <table {...getTableProps()}>
        <thead>
          <tr>
            {headerGroups[0].headers.map((column) => (
              <th
                key={column.id}
                {...column.getHeaderProps(column.getSortByToggleProps())}
                className={
                  column.isSorted ? (column.isSortedDesc ? "desc" : "asc") : ""
                }
              >
                {column.render("Header")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody {...getTableBodyProps()}>
          {rows.map((row) => {
            prepareRow(row);
            return (
              <tr key={row.id} {...row.getRowProps()}>
                {row.cells.map((cell) => {
                  return (
                    <td key={cell.id} {...cell.getCellProps()}>
                      {cell.render("Cell")}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default AdmissionsInnerTable;
