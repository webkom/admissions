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
  const [applications, setApplications] = useState([]);
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

  const generateCSVData = (
    name,
    email,
    username,
    createdAt,
    updatedAt,
    appliedWithinDeadline,
    priorityText,
    group,
    groupApplicationText,
    phoneNumber
  ) => {
    setCsvData((prevState) => [
      ...prevState.csvData,
      {
        name,
        email,
        username,
        createdAt,
        updatedAt,
        appliedWithinDeadline,
        priorityText:
          priorityText != ""
            ? replaceQuotationMarks(priorityText)
            : "Ingen prioriteringer",
        group,
        groupApplicationText: replaceQuotationMarks(groupApplicationText),
        phoneNumber,
      },
    ]);
  };

  useEffect(() => {
    Promise.all([
      callApi("/application/"),
      callApi("/admission/"),
      callApi("/group/"),
    ])
      .then((data) => {
        data.map(({ url, jsonData }) => {
          if (url.includes("/application/")) {
            setApplications(jsonData);
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

  applications.sort(function (a, b) {
    if (a.user.full_name < b.user.full_name) return -1;
    if (a.user.full_name > b.user.full_name) return 1;
    return 0;
  });
  const UserApplications = applications.map((userApplication, i) => {
    return (
      <UserApplicationAdminView
        key={i}
        {...userApplication}
        generateCSVData={generateCSVData}
      />
    );
  });

  const numApplicants = applications.length;

  let numApplications = 0;
  applications.map((application) => {
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
                    applications={applications}
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
          {UserApplications}
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
