import React from "react";
import { Route, Routes, useLocation, useParams } from "react-router-dom";
import styled from "styled-components";
import ViewApplications from "./ViewApplications";
import NavBar from "./components/NavBar";
import { useAdmission } from "src/query/hooks";
import EditGroup from "./EditGroup";

const AdminPage: React.FC = () => {
  const { admissionSlug } = useParams();
  const location = useLocation();
  const { data: admission } = useAdmission(admissionSlug ?? "");
  const showSideNav = location.pathname.includes("/admin/groups/");

  return (
    <PageWrapper>
      <Wrapper $withSideNav={showSideNav}>
        {showSideNav && (
          <LeftSide>
            <NavBar admission={admission} />
          </LeftSide>
        )}
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
  background: var(--color-surface-page);
`;

const Wrapper = styled.div<{ $withSideNav: boolean }>`
  max-width: var(--lego-max-width);
  width: 100%;
  margin: 0 auto;
  padding: var(--spacing-lg);
  display: grid;
  grid-template-columns: ${(props) =>
    props.$withSideNav ? "280px minmax(0, 1fr)" : "minmax(0, 1fr)"};
  gap: 1.25rem;

  @media screen and (max-width: 900px) {
    grid-template-columns: 1fr;
    padding: var(--spacing-md);
  }
`;

const LeftSide = styled.div`
  min-width: 0;
`;

const RightSide = styled.div`
  min-width: 0;
`;
