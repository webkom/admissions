import React, { useEffect, useState } from "react";
import styled from "styled-components";
import FormatTime from "src/components/Time/FormatTime";

import LoadingBall from "src/components/LoadingBall";
import GroupStatistics from "./components/GroupStatistics";
import { replaceQuotationMarks } from "src/utils/methods";
import { useAdmission, useAdminApplications } from "src/query/hooks";
import { useParams } from "react-router-dom";

import AdmissionsContainer from "src/containers/AdmissionsContainer";
import { Application } from "src/types";
import {
  GroupFilterGrid,
  SectionCard,
  SectionDescription,
  SectionEyebrow,
  SectionTitle,
} from "./components/StyledElements";
import djangoData from "src/utils/djangoData";
import { InputFieldModel } from "src/utils/jsonFields";
import CSVExportHandler, {
  CompleteCsvData,
} from "./components/CSVExportHandler";

const ViewApplications = () => {
  const { admissionSlug } = useParams();
  const [sortedApplications, setSortedApplications] = useState<Application[]>(
    [],
  );
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [filteredApplications, setFilteredApplications] = useState<
    Application[]
  >([]);
  const [csvData, setCsvData] = useState<CompleteCsvData[]>([]);

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
  const { groups } = admission ?? {};

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
    setFilteredApplications(
      sortedApplications.filter(
        (application) =>
          selectedGroups.length === 0 ||
          application.group_applications.find((groupApplication) =>
            selectedGroups.includes(groupApplication.group.name),
          ),
      ),
    );
  }, [sortedApplications, selectedGroups]);

  useEffect(() => {
    // Push all the individual applications into csvData with the right format
    const updatedCsvData: CompleteCsvData[] = [];
    filteredApplications.forEach((application) => {
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
  }, [filteredApplications]);

  const numApplicants = sortedApplications.length;
  const selectedGroupCount = selectedGroups.length;
  const visibleGroupCount = (groups ?? []).filter(
    (group) =>
      admission?.userdata.is_admin ||
      group.name === djangoData.user.representative_of_group,
  ).length;

  let numApplications = 0;
  sortedApplications.forEach((application) => {
    numApplications += application.group_applications.length;
  });

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
        <SectionCard>
          <HeaderRow>
            <div>
              <SectionEyebrow>Opptaksadmin</SectionEyebrow>
              <AdmissionTitle>{admission.title}</AdmissionTitle>
              <SectionDescription>
                Hold oversikt over frister, filtrer på grupper og gå rett videre
                til behandling av søknadene.
              </SectionDescription>
              <SummaryLine>
                {numApplicants} {numApplicants === 1 ? "søker" : "søkere"} og{" "}
                {numApplications}{" "}
                {numApplications === 1 ? "søknad" : "søknader"}
              </SummaryLine>
            </div>
          </HeaderRow>

          <TimelineGrid>
            <TimelineItem>
              <TimelineLabel>Søknader åpner</TimelineLabel>
              <TimelineValue>
                <FormatTime format="HH:mm:ss EEEE d. MMMM">
                  {admission.open_from}
                </FormatTime>
              </TimelineValue>
            </TimelineItem>
            <TimelineItem>
              <TimelineLabel>Søknadsfrist</TimelineLabel>
              <TimelineValue>
                <FormatTime format="HH:mm:ss EEEE d. MMMM">
                  {admission.public_deadline}
                </FormatTime>
              </TimelineValue>
            </TimelineItem>
            <TimelineItem>
              <TimelineLabel>Redigeringsfrist</TimelineLabel>
              <TimelineValue>
                <FormatTime format="HH:mm:ss EEEE d. MMMM">
                  {admission.closed_from}
                </FormatTime>
              </TimelineValue>
            </TimelineItem>
          </TimelineGrid>
        </SectionCard>

        <SectionCard>
          <FilterHeader>
            <div>
              <SectionEyebrow>Filtrering</SectionEyebrow>
              <SectionTitle>Gruppeoversikt</SectionTitle>
              <SectionDescription>
                Trykk på en eller flere grupper for å snevre inn tabellen. Når
                ingen grupper er valgt, vises alle søknadene.
              </SectionDescription>
            </div>
            <FilterStatus>
              {selectedGroupCount === 0
                ? `Alle ${visibleGroupCount} grupper vises`
                : `${selectedGroupCount} ${
                    selectedGroupCount === 1 ? "gruppe" : "grupper"
                  } valgt`}
            </FilterStatus>
          </FilterHeader>

          <GroupFilterGrid>
            {(groups !== undefined ? [...groups] : [])
              .filter(
                (group) =>
                  admission.userdata.is_admin ||
                  group.name === djangoData.user.representative_of_group,
              )
              .sort((a, b) => a.name.localeCompare(b.name))
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
          </GroupFilterGrid>
        </SectionCard>
        <CSVExportHandler csvData={csvData} csvHeaders={csvHeaders} />
        <AdmissionsContainer
          admission={admission}
          applications={filteredApplications}
        />
      </PageWrapper>
    );
  }
};

export default ViewApplications;

/** Styles **/

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
`;

const HeaderRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const AdmissionTitle = styled.h1`
  margin: 0;
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: #1f2937;
`;

const SummaryLine = styled.p`
  margin: 0.65rem 0 0;
  color: #374151;
  font-size: 0.95rem;
  font-weight: 600;
`;

const TimelineGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.9rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
`;

const TimelineItem = styled.div`
  padding-right: 0.5rem;
`;

const TimelineLabel = styled.span`
  display: block;
  margin-bottom: 0.4rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6b7280;
`;

const TimelineValue = styled.span`
  color: #1f2937;
  font-weight: 600;
  line-height: 1.5;
`;

const FilterHeader = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
`;

const FilterStatus = styled.span`
  color: #6b7280;
  font-size: 0.9rem;
  font-weight: 600;
`;
