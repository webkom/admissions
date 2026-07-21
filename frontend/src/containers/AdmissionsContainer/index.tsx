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
import ApplicationDetails from "./ApplicationDetails";
import SubComponentWrapper from "./SubComponentWrapper";
import { Admission, AdminApplication, InterviewStatus } from "src/types";
import { useState } from "react";
import styled from "styled-components";
import { TableWrapper } from "src/routes/AdmissionAdmin/components/StyledElements";
import { ArrowDown, ArrowUp } from "lucide-react";
import { breakpoints, iconSizes } from "src/styles/designTokens";
import InterviewTriageList from "src/routes/AdmissionAdmin/components/InterviewTriageList";

interface AdmissionsContainerProps {
  admission: Admission;
  applications: AdminApplication[];
  showGroupColumn: boolean;
}

export interface ApplicationTableRow {
  id: string;
  application: AdminApplication;
  admissionSlug: string;
  username: string;
  fullname: string;
  createdAt: string;
  updatedAt: string;
  appliedWithinDeadline: boolean;
  phoneNumber: string;
  groupNames: string[];
  interviewStatus: InterviewStatus;
  interviewStatusUpdatedAt: string;
  interviewStatusUpdatedBy: string;
  canUpdateInterviewStatus: boolean;
}

const AdmissionsContainer: React.FC<AdmissionsContainerProps> = ({
  admission,
  applications,
  showGroupColumn,
}) => {
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const data = useMemo<ApplicationTableRow[]>(
    () =>
      applications.map((application) => ({
        id: application.pk,
        application,
        admissionSlug: admission.slug,
        username: application.user.username,
        fullname: application.user.full_name,
        phoneNumber: application.phone_number,
        appliedWithinDeadline: application.applied_within_deadline,
        interviewStatus: application.interview_status,
        interviewStatusUpdatedAt: application.interview_status_updated_at,
        interviewStatusUpdatedBy: application.interview_status_updated_by,
        canUpdateInterviewStatus:
          admission.userdata.is_admin || admission.userdata.is_recruiter,
        createdAt: application.created_at,
        updatedAt: application.updated_at,
        groupNames: application.group_applications.map(
          (groupApplication) => groupApplication.group.name,
        ),
      })),
    [
      admission.slug,
      admission.userdata.is_admin,
      admission.userdata.is_recruiter,
      applications,
    ],
  );

  const visibleColumns = useMemo(
    () =>
      showGroupColumn
        ? columns
        : columns.filter((column) => column.id !== "groupNames"),
    [showGroupColumn],
  );

  const table = useReactTable({
    columns: visibleColumns,
    data,
    state: {
      expanded,
      sorting,
    },
    onExpandedChange: setExpanded,
    onSortingChange: setSorting,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const subComponent = React.useCallback(
    ({ row }: { row: Row<ApplicationTableRow> }) => (
      <SubComponentWrapper>
        <ApplicationDetails
          admission={admission}
          application={row.original.application}
        />
      </SubComponentWrapper>
    ),
    [admission],
  );

  return (
    <>
      <DesktopTableWrapper>
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
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1"
                        >
                          {content}
                          {sortDirection === "asc" ? (
                            <ArrowUp
                              size={iconSizes.medium}
                              aria-hidden="true"
                            />
                          ) : sortDirection === "desc" ? (
                            <ArrowDown
                              size={iconSizes.medium}
                              aria-hidden="true"
                            />
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
                <SummaryRow $expanded={row.getIsExpanded()}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} style={{ width: cell.column.getSize() }}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </SummaryRow>
                {row.getIsExpanded() ? (
                  <ExpandedRow>
                    <td colSpan={row.getVisibleCells().length} className="p-0">
                      {subComponent({ row })}
                    </td>
                  </ExpandedRow>
                ) : null}
              </React.Fragment>
            ))}
          </tbody>
        </StyledTable>
      </DesktopTableWrapper>
      <InterviewTriageList admission={admission} applications={applications} />
    </>
  );
};

const DesktopTableWrapper = styled(TableWrapper)`
  max-height: min(72dvh, 48rem);
  overflow: auto;

  @media screen and (max-width: ${breakpoints.handheld}) {
    display: none;
  }
`;

const SummaryRow = styled.tr<{ $expanded: boolean }>`
  && {
    background: ${({ $expanded }) =>
      $expanded ? "var(--color-surface-subtle)" : "var(--color-surface-base)"};
  }

  &:hover {
    background: var(--color-surface-subtle);
  }

  td {
    border-bottom: var(--border-width-default) solid var(--color-border-soft);
    vertical-align: middle;
  }
`;

const ExpandedRow = styled.tr`
  && {
    background: var(--color-surface-subtle);
  }

  > td {
    border-bottom: var(--border-width-default) solid var(--color-border-soft);
  }
`;

const StyledTable = styled.table`
  width: 100%;
  min-width: 52rem;

  thead th {
    position: sticky;
    top: 0;
    z-index: var(--table-header-layer);
    padding: calc(var(--spacing-sm) * 5 / 4) var(--spacing-md);
    border-bottom: var(--border-width-default) solid var(--color-border-soft);
    border-radius: 0;
    background: var(--color-surface-neutral);
    color: var(--color-text-muted);
    font-size: var(--font-size-label);
    font-weight: var(--font-weight-semibold);
    letter-spacing: var(--letter-spacing-label);
  }

  thead button {
    color: inherit;
    font: inherit;
  }

  thead th:first-child,
  thead th:last-child {
    border-radius: 0;
  }
`;

export default AdmissionsContainer;
