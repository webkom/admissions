import React from "react";
import { Route, Routes, useParams } from "react-router-dom";
import styled from "styled-components";
import ViewApplications from "./ViewApplications";
import NavBar from "./components/NavBar";
import { useAdmission } from "src/query/hooks";
import EditGroup from "./EditGroup";

const AdminPage: React.FC = () => {
  const { admissionSlug } = useParams();
  const { data: admission } = useAdmission(admissionSlug ?? "");

  return (
    <PageWrapper>
      <Wrapper>
        <LeftSide>
          <NavBar admission={admission} />
        </LeftSide>
        <RightSide>
          <Routes>
            <Route path="" element={<ViewApplications />} />
            <Route path="groups/:groupId" element={<EditGroup />} />
          </Routes>
        </RightSide>
      </Wrapper>
    </PageWrapper>
  );
};

export default AdminPage;

const PageWrapper = styled.div`
  min-height: calc(100vh - 70px);
`;

const Wrapper = styled.div`
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
  padding: 1.5rem;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 1.25rem;

  @media screen and (max-width: 900px) {
    grid-template-columns: 1fr;
    padding: 1rem;
  }
`;

const LeftSide = styled.div`
  min-width: 0;
`;

const RightSide = styled.div`
  min-width: 0;
`;
