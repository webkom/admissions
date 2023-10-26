import React, { useMemo } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { innerColumns } from "./Columns";
import styled from "styled-components";
import { JsonFieldInput } from "src/types";

export interface InnerTableValues {
  applicationId: number;
  group: string;
  responses: Record<string, string>;
  groupQuestions?: JsonFieldInput[];
}

interface AdmissionsInnerTableProps {
  groupApplications: InnerTableValues[];
}

const AdmissionsInnerTable: React.FC<AdmissionsInnerTableProps> = ({
  groupApplications,
}) => {
  const columns = useMemo(() => innerColumns, []);
  const data = useMemo(() => groupApplications, [groupApplications]);

  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div>
      <StyledTable>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} style={{ width: header.getSize() }}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </StyledTable>
    </div>
  );
};

export default AdmissionsInnerTable;

const StyledTable = styled.table`
  width: 100%;
`;
