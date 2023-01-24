import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useParams } from "react-router-dom";
import { useAdmission, useApplications } from "src/query/hooks";
import djangoData from "src/utils/djangoData";
import { media } from "src/styles/mediaQueries";
import UserApplication from "src/containers/UserApplication";
import LoadingBall from "src/components/LoadingBall";
import EditGroupForm from "./form";
import { replaceQuotationMarks } from "src/utils/methods";
import {
  Wrapper,
  LinkLink,
  CSVExport,
  Statistics,
  StatisticsName,
  StatisticsWrapper,
  GroupLogo,
  GroupLogoWrapper,
} from "./styles";
import { Application } from "src/types";

export interface CsvData {
  name: string;
  email: string;
  username: string;
  applicationText: string;
  createdAt: string;
  updatedAt: string;
  appliedWithinDeadline: boolean;
  phoneNumber: string;
}

const AdminPage = () => {
  const { admissionId } = useParams();
  const [sortedApplications, setSortedApplications] = useState<Application[]>(
    []
  );
  const [csvData, setCsvData] = useState<CsvData[]>([]);

  const csvHeaders = [
    { label: "Full Name", key: "name" },
    { label: "Søknadstekst", key: "applicationText" },
    { label: "Mobilnummer", key: "phoneNumber" },
    { label: "Email", key: "email" },
    { label: "Username", key: "username" },
    { label: "Søkt innen frist", key: "appliedWithinDeadline" },
    { label: "Tid sendt", key: "createdAt" },
    { label: "Tid oppdatert", key: "updatedAt" },
  ];

  const { data: admission } = useAdmission(admissionId ?? "");
  const { groups } = admission ?? {};
  const {
    data: applications,
    isFetching,
    error,
  } = useApplications(admissionId ?? "");

  useEffect(() => {
    if (!applications) return;
    setSortedApplications(
      [...applications].sort((a, b) => {
        if (a.user.full_name < b.user.full_name) return -1;
        if (a.user.full_name > b.user.full_name) return 1;
        return 0;
      })
    );
  }, [applications]);

  useEffect(() => {
    // Push all the individual applications into csvData with the right format
    const updatedCsvData: CsvData[] = [];
    sortedApplications.forEach((userApplication) => {
      updatedCsvData.push({
        name: userApplication.user.full_name,
        email: userApplication.user.email,
        username: userApplication.user.username,
        applicationText: replaceQuotationMarks(
          userApplication.group_applications[0].text
        ),
        createdAt: userApplication.created_at,
        updatedAt: userApplication.updated_at,
        appliedWithinDeadline: userApplication.applied_within_deadline,
        phoneNumber: userApplication.phone_number,
      });
    });
    setCsvData(updatedCsvData);
  }, [sortedApplications]);

  const numApplicants = sortedApplications.length;

  if (error) {
    return <div>Error: {error.message}</div>;
  } else if (isFetching) {
    return <LoadingBall />;
  } else if (!groups) {
    return <div>Feil: klarte ikke laste inn grupper.</div>;
  } else {
    const group = (groups ?? []).find(
      (group) =>
        group.name.toLowerCase() ===
        djangoData.user.representative_of_group.toLowerCase()
    );
    if (!group) return <div>Feil: Ugyldig gruppe</div>;

    return (
      <PageWrapper>
        <PageTitle>Admin Panel</PageTitle>
        <GroupLogoWrapper>
          <GroupLogo src={group.logo} />
          <h2>{djangoData.user.representative_of_group}</h2>
        </GroupLogoWrapper>
        <LinkLink to="/">Gå til forside</LinkLink>

        <Wrapper>
          <EditGroupForm
            initialDescription={group && group.description}
            initialReplyText={group && group.response_label}
            group={group}
          />
        </Wrapper>
        <Wrapper>
          <Statistics>
            <StatisticsWrapper>
              <StatisticsName>Antall søkere</StatisticsName>
              {numApplicants} {numApplicants == 1 ? "søker" : "søkere"}
            </StatisticsWrapper>
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
            <UserApplication
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
