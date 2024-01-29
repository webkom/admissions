import React, { useEffect, useState } from "react";
import styled from "styled-components";
import FormatTime from "src/components/Time/FormatTime";

import LoadingBall from "src/components/LoadingBall";
import GroupStatistics from "./components/GroupStatistics";
import { replaceQuotationMarks } from "src/utils/methods";
import { useAdmission, useApplications } from "src/query/hooks";
import { useParams } from "react-router-dom";

import AdmissionsContainer from "src/containers/AdmissionsContainer";
import { Application } from "src/types";
import {
  Statistics,
  StatisticsName,
  StatisticsWrapper,
} from "./components/StyledElements";
import djangoData from "src/utils/djangoData";
import { InputFieldModel } from "src/utils/jsonFields";
import CSVExportHandler, {
  CompleteCsvData,
} from "./components/CSVExportHandler";

const ViewApplications = () => {
  const { admissionSlug } = useParams();
  const [sortedApplications, setSortedApplications] = useState<Application[]>(
    []
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
  } = useApplications(admissionSlug ?? "");
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
        a.user.full_name.localeCompare(b.user.full_name)
      )
    );
  }, [applications]);

  useEffect(() => {
    setFilteredApplications(
      sortedApplications.filter(
        (application) =>
          selectedGroups.length === 0 ||
          application.group_applications.find((groupApplication) =>
            selectedGroups.includes(groupApplication.group.name)
          )
      )
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
        <Statistics>
          <StatisticsWrapper>
            <StatisticsName>Søknader åpner</StatisticsName>
            <FormatTime format="HH:mm:ss EEEE d. MMMM">
              {admission.open_from}
            </FormatTime>
          </StatisticsWrapper>
          <StatisticsWrapper>
            <StatisticsName>Søknadsfrist</StatisticsName>
            <FormatTime format="HH:mm:ss EEEE d. MMMM">
              {admission.public_deadline}
            </FormatTime>
          </StatisticsWrapper>
          <StatisticsWrapper>
            <StatisticsName>Redigeringsfrist</StatisticsName>
            <FormatTime format="HH:mm:ss EEEE d. MMMM">
              {admission.closed_from}
            </FormatTime>
          </StatisticsWrapper>
        </Statistics>
        <Statistics>
          <StatisticsWrapper smallerMargin>
            <StatisticsName>Antall søkere</StatisticsName>
            {numApplicants} {numApplicants == 1 ? "søker" : "søkere"}
          </StatisticsWrapper>
          <StatisticsWrapper smallerMargin>
            <StatisticsName>Totalt antall søknader</StatisticsName>
            {numApplications} {numApplications == 1 ? "søknad" : "søknader"}
          </StatisticsWrapper>

          <Statistics>
            {(groups !== undefined ? [...groups] : [])
              .filter(
                (group) =>
                  admission.userdata.is_admin ||
                  group.name === djangoData.user.representative_of_group
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
          </Statistics>
        </Statistics>
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

export const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 1em;
  border: 1px solid rgba(0, 0, 0, 0.09);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
`;
