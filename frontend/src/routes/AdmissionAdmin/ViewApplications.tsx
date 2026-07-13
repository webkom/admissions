import React, { useMemo, useState } from "react";
import styled from "styled-components";
import { DateTime } from "luxon";

import { StyledButton } from "src/components/LinkButton";
import LoadingBall from "src/components/LoadingBall";
import AdmissionsContainer from "src/containers/AdmissionsContainer";
import { escapeCsvCell } from "src/utils/methods";
import { useAdmission, useAdminApplications } from "src/query/hooks";
import { useParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

import { InputFieldModel } from "src/utils/jsonFields";
import CSVExportHandler, {
  CompleteCsvData,
} from "./components/CSVExportHandler";
import GroupStatistics from "./components/GroupStatistics";
import {
  actionButtonActive,
  actionButtonBase,
  actionButtonNeutral,
} from "src/components/Scheduling/ui";
import cn from "src/utils/cn";
import { breakpoints, iconSizes } from "src/styles/designTokens";
import { getApiErrorMessage } from "src/utils/apiErrors";

const CSV_TIME_ZONE = "Europe/Oslo";

const formatCsvDate = (value: string): string => {
  const date = DateTime.fromISO(value).setZone(CSV_TIME_ZONE);
  return date.isValid ? date.setLocale("nb").toFormat("dd.MM.yyyy HH:mm") : "";
};

const filenamePart = (value: string): string =>
  value
    .toLocaleLowerCase("nb-NO")
    .replaceAll("ø", "o")
    .replaceAll("æ", "ae")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const ViewApplications = () => {
  const { admissionSlug } = useParams();
  const [showCandidates, setShowCandidates] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  const {
    data: applications,
    error: applicationsError,
    isFetching: applicationsIsFetching,
    refetch: refetchApplications,
  } = useAdminApplications(admissionSlug ?? "");
  const {
    data: admission,
    error: admissionError,
    isFetching: admissionIsFetching,
    refetch: refetchAdmission,
  } = useAdmission(admissionSlug ?? "");
  const sortedApplications = useMemo(
    () =>
      [...(applications ?? [])].sort((a, b) =>
        a.user.full_name.localeCompare(b.user.full_name, "nb"),
      ),
    [applications],
  );
  const filteredApplications = useMemo(() => {
    if (selectedGroups.length === 0) return sortedApplications;

    return sortedApplications.flatMap((application) => {
      const groupApplications = application.group_applications.filter(
        (groupApplication) =>
          selectedGroups.includes(groupApplication.group.name),
      );
      return groupApplications.length > 0
        ? [{ ...application, group_applications: groupApplications }]
        : [];
    });
  }, [selectedGroups, sortedApplications]);
  const questionColumns = useMemo(
    () =>
      admission?.userdata.is_admin
        ? (admission.header_fields ?? [])
            .filter(
              (headerField): headerField is InputFieldModel =>
                "id" in headerField,
            )
            .map((headerField, index) => ({
              id: headerField.id,
              key: `question_${index}`,
              label: headerField.title,
            }))
        : [],
    [admission],
  );
  const csvHeaders = useMemo(
    () => [
      { label: "Fullt navn", key: "name" },
      { label: "Prioriteringer", key: "priorityText" },
      ...questionColumns,
      { label: "Gruppe", key: "group" },
      { label: "Søknadstekst", key: "groupApplicationText" },
      { label: "E-post", key: "email" },
      { label: "Mobilnummer", key: "phoneNumber" },
      { label: "Brukernavn", key: "username" },
      { label: "Søkt innen frist", key: "appliedWithinDeadline" },
      { label: "Tid sendt", key: "createdAt" },
      { label: "Tid oppdatert", key: "updatedAt" },
    ],
    [questionColumns],
  );
  const csvData = useMemo(
    () =>
      filteredApplications.flatMap((application) => {
        const headerResponses = application.header_fields_response ?? {};
        return application.group_applications.map((groupApplication) => ({
          name: application.user.full_name,
          priorityText:
            application.text !== ""
              ? (application.text ?? "")
              : "Ingen prioriteringer",
          ...Object.fromEntries(
            questionColumns.map(({ id, key }) => [
              key,
              headerResponses[id] ?? "",
            ]),
          ),
          group: groupApplication.group.name,
          groupApplicationText: groupApplication.text,
          email: application.user.email,
          phoneNumber: application.phone_number,
          username: application.user.username,
          appliedWithinDeadline: application.applied_within_deadline
            ? "Ja"
            : "Nei",
          createdAt: formatCsvDate(application.created_at),
          updatedAt: formatCsvDate(application.updated_at),
        }));
      }),
    [filteredApplications, questionColumns],
  );

  const numApplicants = filteredApplications.length;

  let numApplications = 0;
  filteredApplications.forEach((application) => {
    numApplications += application.group_applications.length;
  });

  const visibleCsvData = showCandidates ? csvData : [];
  const exportCsvData = visibleCsvData.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === "string" ? escapeCsvCell(value) : value,
      ]),
    ),
  ) as CompleteCsvData[];
  const exportFilename = `${admission?.slug ?? "opptak"}-${
    selectedGroups.length > 0
      ? selectedGroups.map(filenamePart).join("-")
      : "alle-grupper"
  }-${DateTime.now().setZone(CSV_TIME_ZONE).toFormat("yyyy-LL-dd")}.csv`;

  if (applicationsError || admissionError) {
    const requestError = applicationsError ?? admissionError;
    return (
      <ErrorState role="alert">
        <h2>Kunne ikke laste søknadene</h2>
        <p>
          {requestError
            ? getApiErrorMessage(requestError, "Prøv å laste siden på nytt.")
            : "Prøv å laste siden på nytt."}
        </p>
        <StyledButton
          type="button"
          onClick={() => {
            void refetchApplications();
            void refetchAdmission();
          }}
        >
          Prøv igjen
        </StyledButton>
      </ErrorState>
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
            <Title>Søknader</Title>
            <AdmissionName>{admission.title}</AdmissionName>
            <Meta>
              {numApplicants} {numApplicants === 1 ? "søker" : "søkere"} ·{" "}
              {numApplications} {numApplications === 1 ? "søknad" : "søknader"}
            </Meta>
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
              {showCandidates ? (
                <EyeOff size={iconSizes.control} />
              ) : (
                <Eye size={iconSizes.control} />
              )}
              {showCandidates ? "Skjul kandidatdata" : "Vis kandidatdata"}
            </button>
          </HeaderControls>
        </Header>

        <FilterSection aria-labelledby="group-filter-title">
          <FilterTitle id="group-filter-title">Filtrer på gruppe</FilterTitle>
          <GroupFilters>
            {(admission.groups ?? [])
              .filter(
                (group) =>
                  admission.userdata.is_admin ||
                  admission.userdata.committee_groups.includes(group.name),
              )
              .sort((a, b) => a.name.localeCompare(b.name, "nb"))
              .map((group) => (
                <GroupStatistics
                  key={group.pk}
                  applications={sortedApplications}
                  groupName={group.name}
                  groupLogo={group.logo}
                  selectedGroups={selectedGroups}
                  setSelectedGroups={setSelectedGroups}
                />
              ))}
          </GroupFilters>
        </FilterSection>

        {showCandidates ? (
          <>
            <CSVExportHandler
              csvData={exportCsvData}
              csvHeaders={csvHeaders}
              rowCount={csvData.length}
              filename={exportFilename}
            />
            <CsvPreviewTable rows={visibleCsvData} headers={csvHeaders} />
          </>
        ) : (
          <PrivacyPlaceholder>
            <EyeOff size={iconSizes.feature} aria-hidden="true" />
            <div>
              <strong>Kandidatdata er skjult</strong>
              <span>
                Vis innholdet når du er klar til å behandle søknadene.
              </span>
            </div>
          </PrivacyPlaceholder>
        )}
        {showCandidates && (
          <AdmissionsContainer
            admission={admission}
            applications={filteredApplications}
          />
        )}
      </PageWrapper>
    );
  }
};

export default ViewApplications;

type CsvHeader = { label: string; key: string };

const CsvPreviewTable = ({
  rows,
  headers,
}: {
  rows: CompleteCsvData[];
  headers: CsvHeader[];
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
              <td key={header.key} data-column={header.key}>
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

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  width: 100%;
`;

const ErrorState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-md);
  max-width: var(--content-width-form);
  padding: var(--spacing-xl);

  h2,
  p {
    margin: 0;
  }
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-md) 0 var(--spacing-lg);
  border-bottom: var(--border-width-default) solid var(--color-border-soft);

  @media screen and (max-width: ${breakpoints.compact}) {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--spacing-md);
  }
`;

const Title = styled.h1`
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--font-size-xl);
  font-weight: 600;
  line-height: var(--line-height-base);
  text-align: left;
`;

const AdmissionName = styled.p`
  margin: var(--spacing-xs) 0 var(--spacing-md);
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
  font-weight: 600;
`;

const Meta = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
`;

const HeaderControls = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-xl);
  flex-wrap: wrap;
  justify-content: flex-end;

  @media screen and (max-width: ${breakpoints.compact}) {
    justify-content: flex-start;
  }
`;

const FilterSection = styled.section`
  padding: var(--spacing-md);
  border: var(--border-width-emphasis) solid var(--color-border-soft);
  border-radius: var(--border-radius-lg);
  background: var(--color-surface-base);
  box-shadow: var(--shadow-sm);
`;

const FilterTitle = styled.h2`
  margin: 0 0 var(--spacing-lg);
  font-size: var(--font-size-md);
  font-weight: 600;
`;

const GroupFilters = styled.div`
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(var(--layout-card-min-lg), 100%), 1fr)
  );
  gap: var(--spacing-lg);
  width: 100%;
`;

const PrivacyPlaceholder = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  margin: 0;
  padding: var(--spacing-md);
  border: var(--border-width-emphasis) solid var(--color-border-soft);
  border-radius: var(--border-radius-lg);
  background: var(--color-surface-base);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  box-shadow: var(--shadow-sm);

  svg {
    flex: 0 0 auto;
    color: var(--color-brand);
  }

  strong,
  span {
    display: block;
  }

  strong {
    margin-bottom: var(--spacing-sm);
    color: var(--color-text-primary);
    font-weight: 600;
  }
`;

const TableShell = styled.div`
  max-width: 100%;
  width: 100%;
  overflow: auto;
  border: var(--border-width-emphasis) solid var(--color-border-soft);
  border-radius: var(--border-radius-lg);
  background: var(--color-surface-base);
  box-shadow: var(--shadow-sm);
`;

const StyledTable = styled.table`
  min-width: var(--application-table-min-width);
  table-layout: auto;

  th {
    position: sticky;
    top: 0;
    z-index: var(--table-header-layer);
    background: var(--color-gray-2);
    color: var(--color-gray-7);
    font-size: var(--font-size-sm);
    white-space: nowrap;
  }

  td {
    vertical-align: top;
    color: var(--color-text-primary);
    line-height: var(--line-height-base);
  }

  td[data-column="priorityText"],
  td[data-column="groupApplicationText"] {
    min-width: var(--content-width-compact);
    white-space: pre-wrap;
  }

  td[data-column="phoneNumber"],
  td[data-column="createdAt"],
  td[data-column="updatedAt"] {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
`;
