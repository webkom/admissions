import React, { useEffect, useMemo, useState } from "react";
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
import { filterEditableFields } from "src/utils/jsonFieldHelper";

export type BaseCsvData = {
  name: string;
  email: string;
  username: string;
  createdAt: string;
  updatedAt: string;
  appliedWithinDeadline: boolean;
} & Record<string, string | boolean | number>;

const AdminPage = () => {
  const { admissionSlug } = useParams();
  const [sortedApplications, setSortedApplications] = useState<Application[]>(
    []
  );
  const [csvData, setCsvData] = useState<BaseCsvData[]>([]);

  const { data: admission } = useAdmission(admissionSlug ?? "");
  const currentGroup = useMemo(
    () =>
      admission?.groups?.find(
        (group) => group.name === djangoData.user.representative_of_group
      ),
    [admission, djangoData]
  );
  const {
    data: applications,
    isFetching,
    error,
  } = useApplications(admissionSlug ?? "");

  const csvHeaders = useMemo(
    () => [
      { label: "Fullt navn", key: "name" },
      { label: "E-post", key: "email" },
      { label: "Brukernavn", key: "username" },
      { label: "Søkt innen frist", key: "appliedWithinDeadline" },
      { label: "Tid sendt", key: "createdAt" },
      { label: "Tid oppdatert", key: "updatedAt" },
      ...filterEditableFields(admission?.questions).map((question) => ({
        label: question.name,
        key: question.id,
      })),
      ...filterEditableFields(currentGroup?.questions).map((question) => ({
        label: question.name,
        key: question.id,
      })),
    ],
    [admission, currentGroup]
  );

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
    const updatedCsvData: BaseCsvData[] = [];
    sortedApplications.forEach((userApplication) => {
      updatedCsvData.push({
        name: userApplication.user.full_name,
        email: userApplication.user.email,
        username: userApplication.user.username,
        createdAt: userApplication.created_at,
        updatedAt: userApplication.updated_at,
        appliedWithinDeadline: userApplication.applied_within_deadline,
        ...userApplication.responses,
        ...userApplication.group_applications[0].responses,
      });
    });
    setCsvData(updatedCsvData);
  }, [sortedApplications]);

  const numApplicants = sortedApplications.length;

  if (error) {
    return <div>Error: {error.message}</div>;
  } else if (isFetching) {
    return <LoadingBall />;
  } else if (!admission) {
    return <div>Fant ikke opptaket.</div>;
  } else if (!currentGroup) {
    return (
      <div>Feil: fant ingen grupper du har tilgang til å administrere.</div>
    );
  } else {
    return (
      <PageWrapper>
        <PageTitle>Admin Panel</PageTitle>
        <GroupLogoWrapper>
          <GroupLogo src={currentGroup.logo} />
          <h2>{currentGroup.name}</h2>
        </GroupLogoWrapper>
        <LinkLink to="/">Gå til forside</LinkLink>

        <Wrapper>
          <EditGroupForm group={currentGroup} />
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
            <br />
            NB: Åpne CSV-filen i Google Sheets for å være sikker på at den vises
            riktig.
          </CSVExport>
          {sortedApplications.map((userApplication) => (
            <UserApplication
              key={userApplication.user.username}
              admission={admission}
              currentGroup={currentGroup}
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
