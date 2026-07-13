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
import { Admission, Application } from "src/types";
import { useState } from "react";
import styled from "styled-components";
import { TableWrapper } from "src/routes/AdmissionAdmin/components/StyledElements";
import { InputResponseModel } from "src/utils/jsonFields";
import DeleteApplication from "src/components/DeleteApplication";
import { ArrowDown, ArrowUp } from "lucide-react";

interface AdmissionsContainerProps {
  admission: Admission;
  applications: Application[];
}

export interface ApplicationTableRow {
  id: string;
  username: string;
  fullname: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  appliedWithinDeadline: boolean;
  phoneNumber: string;
  text?: string;
  headerFieldsResponse: InputResponseModel;
  groupApplications: InnerTableValues[];
  numApplications: number;
}

const AdmissionsContainer: React.FC<AdmissionsContainerProps> = ({
  admission,
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
        headerFieldsResponse: application.header_fields_response,
        groupApplications: application.group_applications.map(
          (groupApplication) => ({
            applicationId: application.pk,
            groupId: groupApplication.group.pk,
            groupName: groupApplication.group.name,
            text: groupApplication.text,
          }),
        ),
      })),
    [applications],
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
    ({ row }: { row: Row<ApplicationTableRow> }) => (
      <>
        <SubComponentWrapper>
          {admission.userdata.is_admin && (
            <>
              {(!!row.original.text || admission.header_fields.length > 0) && (
                <SubComponentHeader>Generelt</SubComponentHeader>
              )}
              {(admission.header_fields as InputResponseModel[])
                .filter((headerField) => "id" in headerField)
                .map((headerField) => (
                  <p key={headerField.id}>
                    {headerField.title}:{" "}
                    {row.original.headerFieldsResponse[headerField.id]}
                  </p>
                ))}
              <p>{row.original.text}</p>
            </>
          )}
          <SubComponentHeader>Gruppesøknader</SubComponentHeader>
          <AdmissionsInnerTable
            groupApplications={row.original.groupApplications}
          />
          {admission.userdata.is_admin && (
            <DeleteApplication applicationId={row.original.id} />
          )}
        </SubComponentWrapper>
      </>
    ),
    [applications],
  );

  return (
    <TableWrapper>
      <StyledTable>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sortDirection = header.column.getIsSorted();
                const content = flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                );
                return (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    aria-sort={
                      sortDirection === "asc"
                        ? "ascending"
                        : sortDirection === "desc"
                          ? "descending"
                          : undefined
                    }
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        aria-label="Sorter kolonne"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1"
                      >
                        {content}
                        {sortDirection === "asc" ? (
                          <ArrowUp size={16} aria-hidden="true" />
                        ) : sortDirection === "desc" ? (
                          <ArrowDown size={16} aria-hidden="true" />
                        ) : null}
                      </button>
                    ) : (
                      content
                    )}
                  </th>
                );
              })}
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
                  <td
                    colSpan={row.getVisibleCells().length}
                    style={{ padding: 0 }}
                  >
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
  min-width: 800px;
`;

export default AdmissionsContainer;
