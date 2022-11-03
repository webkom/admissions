import React, { useMemo } from "react";
import { useTable, useSortBy, useBlockLayout } from "react-table";
import DeleteApplication from "src/components/Application/DeleteApplication";
import { innerColumns } from "./Columns";

const AdmissionsInnerTable = ({ applicationId, groupApplications }) => {
  const columns = useMemo(() => innerColumns, []);
  const data = useMemo(() => groupApplications, [groupApplications]);

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
                  if (cell.column.id === "actions") {
                    return (
                      <td key={cell.column.id}>
                        <DeleteApplication
                          applicationId={applicationId}
                          groupName={row.original.group}
                        />
                      </td>
                    );
                  }
                  return (
                    <td key={cell.column.id} {...cell.getCellProps()}>
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
