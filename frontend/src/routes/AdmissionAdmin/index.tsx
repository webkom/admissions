import React from "react";
import { Route, Routes } from "react-router-dom";
import styled from "styled-components";
import ViewApplications from "./ViewApplications";
import NavBar from "./components/NavBar";
import EditGroup from "./EditGroup";
import EditFields from "./EditFields";

const AdminPage: React.FC = () => {
  return (
    <PageWrapper>
      <Wrapper>
        <LeftSide>
          <NavBar />
        </LeftSide>
        <RightSide>
          <Routes>
            <Route path="" element={<ViewApplications />} />
            <Route path="edit" element={<EditFields />} />
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
