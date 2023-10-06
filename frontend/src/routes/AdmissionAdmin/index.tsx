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
  background-color: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  padding-bottom: 2em;
`;

const Wrapper = styled.div`
  width: 100%;
  display: flex;
  flex-direction: row;
`;

const LeftSide = styled.div`
  flex-basis: 300px;
  flex-shrink: 0;
`;

const RightSide = styled.div`
  flex-grow: 1;
`;
