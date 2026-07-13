import React from "react";
import styled from "styled-components";
import { Link, Route, Routes } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import LinkButton, { StyledButton } from "src/components/LinkButton";
import LoadingBall from "src/components/LoadingBall";
import { useManageAdmissions } from "src/query/hooks";
import { breakpoints, iconSizes } from "src/styles/designTokens";
import { Admission } from "src/types";
import { getApiErrorMessage } from "src/utils/apiErrors";

import CreateAdmission from "./CreateAdmission";
import NavBar from "./components/NavBar";

const ManageAdmissions: React.FC = () => {
  const { data, isFetching, error, refetch } = useManageAdmissions();

  if (error) {
    return (
      <PageState role="alert">
        <h1>Kunne ikke laste opptakene</h1>
        <p>{getApiErrorMessage(error, "Prøv å laste siden på nytt.")}</p>
        <StyledButton type="button" onClick={() => refetch()}>
          Prøv igjen
        </StyledButton>
      </PageState>
    );
  }

  if (isFetching && !data) {
    return (
      <PageState role="status" aria-label="Laster opptak">
        <LoadingBall />
      </PageState>
    );
  }

  return (
    <PageWrapper>
      <Header>
        <HeaderInner>
          <div>
            <HeaderTitle>Administrer opptak</HeaderTitle>
            <HeaderDescription>
              Opprett og vedlikehold opptak som du har redigeringstilgang til.
            </HeaderDescription>
          </div>
          <BackLink to="/">
            <ArrowLeft size={iconSizes.standard} aria-hidden="true" />
            Til forsiden
          </BackLink>
        </HeaderInner>
      </Header>
      <Main>
        <Sidebar>
          <NavBar admissions={data} />
        </Sidebar>
        <Content>
          <Routes>
            <Route index element={<ManageOverview admissions={data ?? []} />} />
            <Route
              path="create"
              element={<CreateAdmission key="newAdmission" />}
            />
            <Route
              path=":admissionSlug"
              element={<CreateAdmission key="editAdmission" />}
            />
          </Routes>
        </Content>
      </Main>
    </PageWrapper>
  );
};

const ManageOverview = ({ admissions }: { admissions: Admission[] }) => (
  <Overview>
    <h1>
      {admissions.length === 0 ? "Opprett første opptak" : "Velg et opptak"}
    </h1>
    <p>
      {admissions.length === 0
        ? "Start med grunninformasjon, tidsrom og gruppene som skal ha tilgang."
        : "Velg et opptak i listen for å redigere det, eller opprett et nytt."}
    </p>
    <LinkButton to="/manage/create" dark>
      Opprett opptak
    </LinkButton>
  </Overview>
);

export default ManageAdmissions;

const PageWrapper = styled.div`
  min-height: 100dvh;
  background: var(--color-surface-base);
`;

const Header = styled.header`
  width: 100%;
  padding: var(--spacing-xl);
  border-bottom: var(--border-width-default) solid var(--color-border-soft);
  background: var(--color-surface-page);
`;

const HeaderInner = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--spacing-xl);
  max-width: var(--content-width-wide);
  margin: 0 auto;

  @media screen and (max-width: ${breakpoints.handheld}) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const HeaderTitle = styled.h1`
  margin: 0;
  font-size: var(--font-size-heading-md);
`;

const HeaderDescription = styled.p`
  margin: var(--spacing-xs) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
`;

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-weight: 600;
`;

const Main = styled.main`
  display: grid;
  grid-template-columns: var(--management-sidebar-width) minmax(0, 1fr);
  gap: var(--spacing-xl);
  max-width: var(--content-width-wide);
  margin: 0 auto;
  padding: var(--spacing-2xl) 0;

  @media screen and (max-width: ${breakpoints.portrait}) {
    grid-template-columns: 1fr;
    padding-top: var(--spacing-xl);
  }
`;

const Sidebar = styled.aside`
  border-right: var(--border-width-default) solid var(--color-border-soft);

  @media screen and (max-width: ${breakpoints.portrait}) {
    padding-bottom: var(--spacing-xl);
    border-right: 0;
    border-bottom: var(--border-width-default) solid var(--color-border-soft);
  }
`;

const Content = styled.div`
  min-width: 0;
`;

const Overview = styled.section`
  max-width: var(--content-width-form);
  padding: var(--spacing-xl);

  h1 {
    margin-top: 0;
  }

  p {
    color: var(--color-text-muted);
    line-height: var(--line-height-relaxed);
  }
`;

const PageState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-md);
  max-width: var(--content-width-form);
  margin: var(--spacing-3xl) auto;
  padding: var(--spacing-xl);

  h1,
  p {
    margin: 0;
  }
`;
