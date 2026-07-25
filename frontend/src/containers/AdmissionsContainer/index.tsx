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
import Icon from "src/components/Icon";
import { TableWrapper } from "src/routes/AdmissionAdmin/components/StyledElements";
import { InputFieldModel } from "src/utils/jsonFields";
import DeleteApplication from "src/components/DeleteApplication";

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
  priorityText?: string;
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
        priorityText: application.priority_text,
        groupApplications: application.group_applications.map(
          (groupApplication) => {
            const groupFields = (
              admission.groups.find(
                (group) => group.pk === groupApplication.group.pk,
              )?.header_fields ?? []
            ).filter((field): field is InputFieldModel => "id" in field);
            return {
              applicationId: application.pk,
              groupId: groupApplication.group.pk,
              groupName: groupApplication.group.name,
              text: groupApplication.text,
              answers: groupFields.map((field) => {
                const response =
                  groupApplication.header_fields_response?.[field.id];
                return {
                  id: field.id,
                  title: field.title,
                  value:
                    typeof response === "boolean"
                      ? response
                        ? "Ja"
                        : "Nei"
                      : response?.trim() || "Ikke besvart",
                };
              }),
            };
          },
        ),
      })),
    [admission.groups, applications],
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
              {row.original.priorityText && (
                <>
                  <SubComponentHeader>
                    Prioriteringer og kommentarer
                  </SubComponentHeader>
                  <p>{row.original.priorityText}</p>
                </>
              )}
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
    [admission.userdata.is_admin],
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
                        header.getContext(),
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

const SortArrow = ({ name }: { name: string }) => (
  <Icon
    name={name}
    size="24px"
    padding="0 0 0 5px"
    styles={{ verticalAlign: "text-top" }}
  />
);

export default AdmissionsContainer;
