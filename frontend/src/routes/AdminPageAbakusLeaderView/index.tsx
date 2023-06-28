import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import FormatTime from "src/components/Time/FormatTime";

import { media } from "src/styles/mediaQueries";

import LoadingBall from "src/components/LoadingBall";
import Wrapper from "./Wrapper";
import LinkLink from "./LinkLink";
import CSVExport from "./CSVExport";
import Statistics from "./Statistics";
import GroupStatistics from "./GroupStatistics";
import StatisticsName from "./StatisticsName";
import StatisticsWrapper from "./StatisticsWrapper";
import { replaceQuotationMarks } from "src/utils/methods";
import { useAdmission, useApplications } from "src/query/hooks";
import { useParams } from "react-router-dom";

import AdmissionsContainer from "src/containers/AdmissionsContainer";
import { BaseCsvData } from "src/routes/AdminPage";
import { Application } from "src/types";
import { filterEditableFields } from "src/utils/jsonFieldHelper";

type AdmissionAdminCsvData = {
  group: string;
} & BaseCsvData;

const AdminPageAbakusLeaderView = () => {
  const { admissionSlug } = useParams();
  const [sortedApplications, setSortedApplications] = useState<Application[]>(
    []
  );
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [filteredApplications, setFilteredApplications] = useState<
    Application[]
  >([]);
  const [csvData, setCsvData] = useState<AdmissionAdminCsvData[]>([]);

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

  const csvHeaders = useMemo(
    () => [
      { label: "Fullt navn", key: "name" },
      { label: "Gruppe", key: "group" },
      { label: "Søknadstekst(er)", key: "groupApplicationText" },
      { label: "E-post", key: "email" },
      { label: "Brukernavn", key: "username" },
      { label: "Søkt innen frist", key: "appliedWithinDeadline" },
      { label: "Tid sendt", key: "createdAt" },
      { label: "Tid oppdatert", key: "updatedAt" },
      ...filterEditableFields(admission?.questions).map((question) => ({
        label: question.name,
        key: question.id,
      })),
    ],
    []
  );

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
    const updatedCsvData: AdmissionAdminCsvData[] = [];
    filteredApplications.forEach((application) => {
      application.group_applications.forEach((groupApplication) => {
        const csvDataItem: AdmissionAdminCsvData = {
          name: application.user.full_name,
          email: application.user.email,
          username: application.user.username,
          createdAt: application.created_at,
          updatedAt: application.updated_at,
          appliedWithinDeadline: application.applied_within_deadline,
          group: groupApplication.group.name,
          groupApplicationText: Object.entries(groupApplication.responses)
            .map(([id, value]) => {
              const questionName: string =
                filterEditableFields(
                  admission?.groups.find(
                    (group) => group.pk === groupApplication.group.pk
                  )?.questions
                ).find((question) => question.id === id)?.name ??
                "Fant ikke spørsmålet";
              return replaceQuotationMarks(questionName + ":\n" + value);
            })
            .join("\n\n"),
          ...application.responses,
        };
        updatedCsvData.push(csvDataItem);
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
        <PageTitle>Admin Panel</PageTitle>
        <LinkLink to="/">Gå til forside</LinkLink>
        <Wrapper>
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
            <StatisticsWrapper>
              <StatisticsName>Antall søkere</StatisticsName>
              {numApplicants} {numApplicants == 1 ? "søker" : "søkere"}
            </StatisticsWrapper>
            <StatisticsWrapper>
              <StatisticsName>Totalt antall søknader</StatisticsName>
              {numApplications} {numApplications == 1 ? "søknad" : "søknader"}
            </StatisticsWrapper>

            <Statistics>
              {(groups !== undefined ? [...groups] : [])
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
          <CSVExport
            data={csvData}
            headers={csvHeaders}
            filename={"applications.csv"}
            target="_blank"
          >
            Eksporter som csv
            <br />
            NB: Åpne CSV-filen i Google Sheets for å være sikker på at den vises
            riktig.
          </CSVExport>
          <AdmissionsContainer
            admission={admission}
            applications={filteredApplications}
          />
        </Wrapper>
      </PageWrapper>
    );
  }
};

export default AdminPageAbakusLeaderView;

/** Styles **/

export const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
`;

const PageTitle = styled.h1`
  ${media.handheld`
    margin: 0 1em 0 1em;
    font-size: 2.5rem;
  `};
`;
