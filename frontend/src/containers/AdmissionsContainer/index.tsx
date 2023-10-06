import React, { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  Row,
  getExpandedRowModel,
  ExpandedState,
  SortingState,
  getSortedRowModel,
} from "@tanstack/react-table";
import { columns } from "./Columns";
import AdmissionsInnerTable, { InnerTableValues } from "./InnerTable";
import SubComponentWrapper from "./SubComponentWrapper";
import SubComponentHeader from "./SubComponentHeader";
import { Application } from "src/types";
import { useState } from "react";
import styled from "styled-components";
import Icon from "src/components/Icon";
import { TableWrapper } from "src/routes/AdmissionAdmin/components/StyledElements";

interface AdmissionsContainerProps {
  applications: Application[];
}

export interface AdmissionsTableValues {
  username: string;
  fullname: string;
  phoneNumber: string;
  email: string;
  appliedWithinDeadline: boolean;
  numApplications: number;
  createdAt: string;
  updatedAt: string;
  text?: string;
  groupApplications: InnerTableValues[];
}

const AdmissionsContainer: React.FC<AdmissionsContainerProps> = ({
  applications,
}) => {
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const data = useMemo(
    () =>
      applications.map((application) => ({
        id: application.pk,
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
          (groupApplication) => ({
            applicationId: application.pk,
            group: groupApplication.group.name,
            text: groupApplication.text,
          })
        ),
      })),
    [applications]
  );

  const table = useReactTable({
    columns,
    data,
    state: {
      expanded,
      sorting,
    },
    onExpandedChange: setExpanded,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const subComponent = React.useCallback(
    ({ row }: { row: Row<AdmissionsTableValues> }) => (
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
    <TableWrapper>
      <StyledTable>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} style={{ width: header.getSize() }}>
                  {header.isPlaceholder ? null : (
                    <div
                      style={
                        header.column.getCanSort()
                          ? { cursor: "pointer" }
                          : undefined
                      }
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {{
                        asc: <SortArrow name="arrow-dropup" />,
                        desc: <SortArrow name="arrow-dropdown" />,
                      }[header.column.getIsSorted() as string] ?? null}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <React.Fragment key={row.id}>
              <tr>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
              {row.getIsExpanded() ? (
                <tr>
                  <td colSpan={row.getVisibleCells().length}>
                    {subComponent({ row })}
                  </td>
                </tr>
              ) : null}
            </React.Fragment>
          ))}
        </tbody>
      </StyledTable>
    </TableWrapper>
  );
};

const StyledTable = styled.table`
  width: 100%;
  min-width: 850px;
`;

const SortArrow = ({ name }: { name: string }) => (
  <Icon
    name={name}
    size="24px"
    padding="0 0 0 5px"
    styles={{ verticalAlign: "text-top" }}
  />
);

export default AdmissionsContainer;
