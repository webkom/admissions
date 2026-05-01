import React, { useEffect, useState } from "react";
import styled from "styled-components";

import LoadingBall from "src/components/LoadingBall";
import { replaceQuotationMarks } from "src/utils/methods";
import { useAdmission, useAdminApplications } from "src/query/hooks";
import { useParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

import { Application } from "src/types";
import { InputFieldModel } from "src/utils/jsonFields";
import CSVExportHandler, {
  CompleteCsvData,
} from "./components/CSVExportHandler";
import {
  actionButtonActive,
  actionButtonBase,
  actionButtonNeutral,
} from "src/components/Scheduling/ui";
import cn from "src/utils/cn";

const ViewApplications = () => {
  const { admissionSlug } = useParams();
  const [sortedApplications, setSortedApplications] = useState<Application[]>(
    [],
  );
  const [csvData, setCsvData] = useState<CompleteCsvData[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);

  const {
    data: applications,
    error: applicationsError,
    isFetching: applicationsIsFetching,
  } = useAdminApplications(admissionSlug ?? "");
  const {
    data: admission,
    error: admissionError,
    isFetching: admissionIsFetching,
  } = useAdmission(admissionSlug ?? "");
  const csvHeaders = [
    { label: "Fullt Navn", key: "name" },
    { label: "Prioriteringer", key: "priorityText" },
    ...(admission?.userdata.is_admin
      ? (admission?.header_fields as InputFieldModel[])
          .filter((headerField) => "id" in headerField)
          .map((headerField) => ({
            label: headerField.title,
            key: headerField.id,
          }))
      : []),
    { label: "Gruppe", key: "group" },
    { label: "Søknadstekst", key: "groupApplicationText" },
    { label: "E-post", key: "email" },
    { label: "Mobilnummer", key: "phoneNumber" },
    { label: "Brukernavn", key: "username" },
    { label: "Søkt innen frist", key: "appliedWithinDeadline" },
    { label: "Tid sendt", key: "createdAt" },
    { label: "Tid oppdatert", key: "updatedAt" },
  ];

  useEffect(() => {
    if (!applications) return;
    setSortedApplications(
      [...applications].sort((a, b) =>
        a.user.full_name.localeCompare(b.user.full_name),
      ),
    );
  }, [applications]);

  useEffect(() => {
    const updatedCsvData: CompleteCsvData[] = [];
    sortedApplications.forEach((application) => {
      application.group_applications.forEach((groupApplication) => {
        updatedCsvData.push({
          name: application.user.full_name,
          priorityText:
            application.text !== ""
              ? replaceQuotationMarks(application.text ?? "")
              : "Ingen prioriteringer",
          ...application.header_fields_response,
          group: groupApplication.group.name,
          groupApplicationText: replaceQuotationMarks(groupApplication.text),
          email: application.user.email,
          phoneNumber: application.phone_number,
          username: application.user.username,
          appliedWithinDeadline: application.applied_within_deadline,
          createdAt: application.created_at,
          updatedAt: application.updated_at,
        });
      });
    });
    setCsvData(updatedCsvData);
  }, [sortedApplications]);

  const numApplicants = sortedApplications.length;

  let numApplications = 0;
  sortedApplications.forEach((application) => {
    numApplications += application.group_applications.length;
  });

  const visibleCsvData = showCandidates
    ? csvData
    : csvData.map(maskCandidateFields);

  if (applicationsError || admissionError) {
    return (
      <div>
        Error: {applicationsError?.message}
        {admissionError?.message}
      </div>
    );
  } else if (applicationsIsFetching || admissionIsFetching) {
    return <LoadingBall />;
  } else if (!admission) {
    return <p>Opptak {admissionSlug} ble ikke funnet i systemet.</p>;
  } else {
    return (
      <PageWrapper>
        <Header>
          <div>
            <Eyebrow>CSV</Eyebrow>
            <Title>{admission.title}</Title>
          </div>
          <HeaderControls>
            <button
              type="button"
              aria-pressed={showCandidates}
              onClick={() => setShowCandidates((current) => !current)}
              className={cn(
                actionButtonBase,
                showCandidates ? actionButtonActive : actionButtonNeutral,
                "px-3 py-2",
              )}
            >
              {showCandidates ? <EyeOff size={14} /> : <Eye size={14} />}
              {showCandidates ? "Skjul innhold" : "Vis innhold"}
            </button>
            <Meta>
              {numApplicants} {numApplicants === 1 ? "søker" : "søkere"} ·{" "}
              {numApplications} {numApplications === 1 ? "søknad" : "søknader"}
            </Meta>
          </HeaderControls>
        </Header>

        <CSVExportHandler
          csvData={visibleCsvData}
          csvHeaders={csvHeaders}
          rowCount={csvData.length}
        />
        <CsvPreviewTable
          rows={visibleCsvData}
          headers={csvHeaders}
          showCandidates={showCandidates}
        />
      </PageWrapper>
    );
  }
};

export default ViewApplications;

type CsvHeader = { label: string; key: string };
const SENSITIVE_FIELD_KEYS = new Set([
  "name",
  "priorityText",
  "groupApplicationText",
  "email",
  "phoneNumber",
  "username",
]);

const maskCandidateFields = (row: CompleteCsvData): CompleteCsvData => ({
  ...row,
  name: "Skjult",
  priorityText: "Skjult",
  groupApplicationText: "Skjult",
  email: "Skjult",
  phoneNumber: "Skjult",
  username: "Skjult",
});

const CsvPreviewTable = ({
  rows,
  headers,
  showCandidates,
}: {
  rows: CompleteCsvData[];
  headers: CsvHeader[];
  showCandidates: boolean;
}) => (
  <TableShell>
    <StyledTable>
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header.key}>{header.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={`${row.username}-${row.group}-${rowIndex}`}>
            {headers.map((header) => (
              <td
                key={header.key}
                data-column={header.key}
                data-masked={
                  !showCandidates && SENSITIVE_FIELD_KEYS.has(header.key)
                    ? "true"
                    : undefined
                }
              >
                {renderCsvCell(row[header.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </StyledTable>
  </TableShell>
);

const renderCsvCell = (value: CompleteCsvData[string]): React.ReactNode => {
  if (typeof value === "boolean") return value ? "Ja" : "Nei";
  if (value === null || value === undefined || value === "") return "—";

  return String(value);
};

/** Styles **/

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.5rem;

  @media screen and (max-width: 700px) {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.35rem;
  }
`;

const Eyebrow = styled.span`
  display: block;
  margin-bottom: 0.25rem;
  color: var(--color-text-subtle);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
`;

const Title = styled.h1`
  margin: 0;
  color: var(--color-text-primary);
  font-size: 1.35rem;
  font-weight: 750;
  line-height: 1.2;
  text-align: left;
`;

const Meta = styled.span`
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
`;

const HeaderControls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex-wrap: wrap;
  justify-content: flex-end;

  @media screen and (max-width: 700px) {
    justify-content: flex-start;
  }
`;

const TableShell = styled.div`
  max-width: 100%;
  width: 100%;
  overflow: auto;
  border: 1px solid var(--color-border-soft);
  border-radius: 8px;
  background: var(--color-surface-base);
`;

const StyledTable = styled.table`
  min-width: 1180px;
  table-layout: auto;

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--color-surface-base);
    color: var(--color-text-subtle);
    font-size: 0.68rem;
    white-space: nowrap;
  }

  td {
    vertical-align: top;
    color: var(--color-text-primary);
    line-height: 1.45;
  }

  td[data-masked="true"] {
    color: var(--color-text-subtle);
    font-style: italic;
  }

  td[data-column="priorityText"],
  td[data-column="groupApplicationText"] {
    min-width: 24rem;
    white-space: pre-wrap;
  }

  td[data-column="phoneNumber"],
  td[data-column="createdAt"],
  td[data-column="updatedAt"] {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
`;
