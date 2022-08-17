import React, { useEffect, useState } from "react";
import styled from "styled-components";
import Moment from "react-moment";
import "moment/locale/nb";
Moment.globalLocale = "nb";

import callApi from "src/utils/callApi";

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

const AdminPage = () => {
  const [error, setError] = useState(null);
  const [isFetching, setIsFetching] = useState(true);
  const [admission, setAdmission] = useState(null);
  const [sortedApplications, setSortedApplications] = useState([]);
  const [groups, setGroups] = useState([]);
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

  useEffect(() => {
    Promise.all([
      callApi("/application/"),
      callApi("/admission/"),
      callApi("/group/"),
    ])
      .then((data) => {
        data.map(({ url, jsonData }) => {
          if (url.includes("/application/")) {
            setSortedApplications(
              [...jsonData].sort((a, b) =>
                a.user.full_name.localeCompare(b.user.full_name)
              )
            );
          } else if (url.includes("/admission/")) {
            setAdmission(jsonData[0]);
          } else if (url.includes("/group/")) {
            setGroups(jsonData);
          }
        });
        setIsFetching(false);
      })
      .catch((error) => {
        setError(error);
        setIsFetching(false);
      });
  }, []);

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

  if (error) {
    return <div>Error: {error.message}</div>;
  } else if (isFetching) {
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
              <Moment format="HH:mm:ss dddd Do MMMM">
                {admission.open_from}
              </Moment>
            </StatisticsWrapper>
            <StatisticsWrapper>
              <StatisticsName>Søknadsfrist</StatisticsName>
              <Moment format="HH:mm:ss dddd Do MMMM">
                {admission.public_deadline}
              </Moment>
            </StatisticsWrapper>
            <StatisticsWrapper>
              <StatisticsName>Redigeringsfrist</StatisticsName>
              <Moment format="HH:mm:ss dddd Do MMMM">
                {admission.application_deadline}
              </Moment>
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
              {groups
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

export default AdminPage;

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
