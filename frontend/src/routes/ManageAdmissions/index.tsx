import React from "react";
import styled from "styled-components";
import { Link, Route, Routes } from "react-router-dom";
import { useAdminAdmissions } from "src/query/hooks";
import { media } from "src/styles/mediaQueries";
import LoadingBall from "src/components/LoadingBall";
import NavBar from "./components/NavBar";
import CreateAdmission from "./CreateAdmission";

const ManageAdmissions: React.FC = () => {
  const { data, isFetching, error } = useAdminAdmissions();

  if (error) {
    return <div>Error: {error.message}</div>;
  } else if (isFetching && !data) {
    return <LoadingBall />;
  } else {
    return (
      <PageWrapper>
        <Header>
          <h2>Administrer opptak</h2>
          <Link to={"/"}>Gå tilbake til forsiden</Link>
        </Header>
        <Wrapper>
          <LeftSide>
            <NavBar admissions={data} />
          </LeftSide>
          <RightSide>
            <Routes>
              <Route path="" element={<CreateAdmission key="newAdmission" />} />
              <Route
                path=":admissionSlug"
                element={<CreateAdmission key="editAdmission" />}
              />
            </Routes>
          </RightSide>
        </Wrapper>
      </PageWrapper>
    );
  }
};

export default ManageAdmissions;

/** Styles **/

export const PageWrapper = styled.div`
  background-color: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  padding-bottom: 2em;
`;

const Header = styled.div`
  width: 100%;
  background: var(--lego-background);
  margin-bottom: 1rem;
  a,
  h2 {
    margin-left: 1rem;
  }
  h2 {
    margin-bottom: 0;
  }
  ${media.handheld`
    margin: 0 1em 0 1em;
    font-size: 2.5rem;
  `};
`;

const Wrapper = styled.div`
  width: 100%;
  display: flex;
  flex-direction: row;
`;

const LeftSide = styled.div`
  flex-basis: 250px;
  flex-shrink: 0;
`;

const RightSide = styled.div`
  flex-grow: 1;
`;
