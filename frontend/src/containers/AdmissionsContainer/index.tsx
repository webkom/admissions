import React, { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  Row,
  getExpandedRowModel,
  ExpandedState,
} from "@tanstack/react-table";
import { columns } from "./Columns";
import AdmissionsInnerTable, { InnerTableValues } from "./InnerTable";
import SubComponentWrapper from "./SubComponentWrapper";
import SubComponentHeader from "./SubComponentHeader";
import { Application } from "src/types";
import { useState } from "react";

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
  text: string;
  groupApplications: InnerTableValues[];
}

const AdmissionsContainer: React.FC<AdmissionsContainerProps> = ({
  applications,
}) => {
  const [expanded, setExpanded] = useState<ExpandedState>({});
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
    },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
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
    <div>
      <table>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
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
            <React.Fragment key={row.id}>
              <tr>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
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
      </table>
    </div>
  );
};

export default AdmissionsContainer;
