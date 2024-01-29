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
`;

const Wrapper = styled.div`
  min-height: calc(100vh - 70px);
  width: 100%;
  display: flex;
  flex-direction: row;
  overflow-x: auto;
`;

const LeftSide = styled.div`
  flex-basis: 245px;
  flex-shrink: 0;
`;

const RightSide = styled.div`
  flex-grow: 1;
`;
