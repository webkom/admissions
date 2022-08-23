import React, { useEffect, useState } from "react";
import styled from "styled-components";
import FormatTime from "src/components/Time/FormatTime";

import UserApplicationAdminView from "src/containers/UserApplicationAdminView";
import { media } from "src/styles/mediaQueries";

import LoadingBall from "src/components/LoadingBall";
import Wrapper from "./Wrapper";
import LinkLink from "./LinkLink";
import CSVExport from "./CSVExport";
import Statistics from "./Statistics";
import GroupStatistics from "./GroupStatistics";
import StatisticsName from "./StatisticsName";
import StatisticsWrapper from "./StatisticsWrapper";
import { replaceQuotationMarks } from "../../utils/replaceQuotationMarks";
import { useAdmission, useApplications } from "src/query/hooks";
import { useGroups } from "../../query/hooks";

const AdminPageAbakusLeaderView = () => {
  const [sortedApplications, setSortedApplications] = useState([]);
  const [csvData, setCsvData] = useState([]);

  const csvHeaders = [
    { label: "Full Name", key: "name" },
    { label: "Prioriteringer", key: "priorityText" },
    { label: "Komité", key: "group" },
    { label: "Søknadstekst", key: "groupApplicationText" },
    { label: "Email", key: "email" },
    { label: "Mobilnummer", key: "phoneNumber" },
    { label: "Username", key: "username" },
    { label: "Søkt innen frist", key: "appliedWithinDeadline" },
    { label: "Tid sendt", key: "createdAt" },
    { label: "Tid oppdatert", key: "updatedAt" },
  ];

  const {
    data: applications,
    error: applicationsError,
    isFetching: applicationsIsFetching,
  } = useApplications();
  const {
    data: admission,
    error: admissionError,
    isFetching: admissionIsFetching,
  } = useAdmission();
  const {
    data: groups,
    error: groupsError,
    isFetching: groupsIsFetching,
  } = useGroups();

  useEffect(() => {
    if (!applications) return;
    setSortedApplications(
      [...applications].sort((a, b) =>
        a.user.full_name.localeCompare(b.user.full_name)
      )
    );
  }, [applications]);

  useEffect(() => {
    // Push all the individual applications into csvData with the right format
    const updatedCsvData = [];
    sortedApplications.forEach((application) => {
      application.group_applications.forEach((groupApplication) => {
        updatedCsvData.push({
          name: application.user.full_name,
          email: application.user.email,
          username: application.user.username,
          createdAt: application.created_at,
          updatedAt: application.updated_at,
          appliedWithinDeadline: application.applied_within_deadline,
          priorityText:
            application.text != ""
              ? replaceQuotationMarks(application.text)
              : "Ingen prioriteringer",
          group: groupApplication.group.name,
          groupApplicationText: replaceQuotationMarks(groupApplication.text),
          phoneNumber: application.phone_number,
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

  if (applicationsError || admissionError || groupsError) {
    return (
      <div>
        Error: {applicationsError.message}
        {admissionError.message}
      </div>
    );
  } else if (
    applicationsIsFetching ||
    admissionIsFetching ||
    groupsIsFetching
  ) {
    return <LoadingBall />;
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
                {admission.application_deadline}
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
          </CSVExport>
          {sortedApplications.map((userApplication) => (
            <UserApplicationAdminView
              key={userApplication.user.username}
              {...userApplication}
            />
          ))}
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
