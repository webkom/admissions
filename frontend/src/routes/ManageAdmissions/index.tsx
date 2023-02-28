import React from "react";
import styled from "styled-components";
import { Route, Routes } from "react-router-dom";
import { useAdmissions } from "src/query/hooks";
import { media } from "src/styles/mediaQueries";
import LoadingBall from "src/components/LoadingBall";
import NavBar from "./components/NavBar";
import CreateAdmission from "./CreateAdmission";

const ManageAdmissions: React.FC = () => {
  const { data, isFetching, error } = useAdmissions();

  if (error) {
    return <div>Error: {error.message}</div>;
  } else if (isFetching) {
    return <LoadingBall />;
  } else {
    return (
      <PageWrapper>
        <Header>
          <h1>Administrer opptak</h1>
        </Header>
        <Wrapper>
          <LeftSide>
            <NavBar admissions={data} />
          </LeftSide>
          <RightSide>
            <Routes>
              <Route path="" element={<CreateAdmission key="newAdmission" />} />
              <Route
                path=":admissionId"
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
