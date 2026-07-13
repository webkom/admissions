import React, { Suspense, useEffect, useLayoutEffect, useState } from "react";
import { Route, Routes, useParams } from "react-router-dom";
import styled from "styled-components";

import {
  createDraftAdmissionScope,
  getIsEditingDraft,
  getSelectedGroupsDraft,
  saveIsEditingDraft,
  saveSelectedGroupsDraft,
  setDraftAdmissionScope,
} from "src/utils/draftHelper";
import djangoData, { isLoggedIn } from "src/utils/djangoData";

import { useAdmission, useMyApplication } from "src/query/hooks";

import LoadingBall from "src/components/LoadingBall";
import NavBar from "src/components/NavBar";
import NotFoundPage from "./NotFoundPage";
import RequireAuth from "src/components/RequireAuth";

const ApplicationForm = React.lazy(() => import("src/routes/ApplicationForm"));
const ReceiptForm = React.lazy(() => import("src/routes/ReceiptForm"));
const GroupsPage = React.lazy(() => import("src/routes/GroupsPage"));
const AdmissionAdmin = React.lazy(() => import("src/routes/AdmissionAdmin"));
const SchedulePage = React.lazy(() => import("./SchedulePage"));

interface SelectedGroups {
  [key: string]: boolean;
}

const ApplicationPortal = () => {
  const { admissionSlug } = useParams();
  const userId = djangoData.user.id ?? "";
  const draftScope = createDraftAdmissionScope(admissionSlug ?? "", userId);

  const [selectedGroups, setSelectedGroups] = useState<SelectedGroups>(() =>
    getSelectedGroupsDraft(draftScope),
  );
  const [isEditingApplication, setIsEditingApplication] = useState<
    boolean | null
  >(null);
  const [activeDraftScope, setActiveDraftScope] = useState<string | null>(null);

  useLayoutEffect(() => {
    setDraftAdmissionScope(admissionSlug ?? "", userId);
    setSelectedGroups(getSelectedGroupsDraft(draftScope));
    setIsEditingApplication(null);
    setActiveDraftScope(draftScope);
  }, [admissionSlug, draftScope, userId]);

  const { data: myApplication } = useMyApplication(admissionSlug ?? "");
  const {
    data: admission,
    isLoading,
    error,
  } = useAdmission(admissionSlug ?? "");
  const { groups } = admission ?? {};
  const isMember = (admission?.userdata.committee_groups?.length ?? 0) > 0;
  const isPrivileged = !!admission?.userdata.is_privileged;

  const toggleGroup = (name: string) => {
    setSelectedGroups({
      ...selectedGroups,
      [name.toLowerCase()]: !selectedGroups[name.toLowerCase()],
    });
  };

  const toggleIsEditing = () => {
    setIsEditingApplication(!isEditingApplication);
  };

  const persistState = () => {
    saveSelectedGroupsDraft(selectedGroups);
  };

  useEffect(() => {
    if (isEditingApplication === null && myApplication !== undefined) {
      setIsEditingApplication(!myApplication);
    }
  }, [isEditingApplication, myApplication]);

  useEffect(() => {
    if (isLoading) return;
    setIsEditingApplication(!myApplication || getIsEditingDraft());
    if (!myApplication) return;
    setSelectedGroups(
      myApplication.group_applications
        ?.map((a) => a.group.name.toLowerCase())
        .reduce((obj, a) => ({ ...obj, [a]: true }), {}),
    );
  }, [isLoading, myApplication]);

  useEffect(() => {
    if (activeDraftScope !== draftScope) return;
    persistState();
  }, [activeDraftScope, draftScope, selectedGroups]);

  useEffect(() => {
    if (activeDraftScope !== draftScope) return;
    persistState();
    if (isEditingApplication === null) return;
    saveIsEditingDraft(isEditingApplication);
  }, [activeDraftScope, draftScope, isEditingApplication]);

  useEffect(() => {
    if (admission?.groups.length === 1) {
      setSelectedGroups({ [admission.groups[0].name.toLowerCase()]: true });
    }
  }, [admission]);

  if (!isLoggedIn()) {
    return null;
  } else if (error) {
    if (error.response?.status === 404) {
      return <NotFoundPage />;
    }
    return <div>Error: {error.message}</div>;
  } else if (isLoading || activeDraftScope !== draftScope) {
    return <LoadingBall />;
  } else {
    return (
      <PageWrapper>
        <NavBar isEditing={!!isEditingApplication} />
        <ContentContainer>
          <Suspense fallback={<LoadingBall />}>
            <Routes>
              <Route
                path="/velg-grupper"
                element={
                  <GroupsPage
                    toggleGroup={toggleGroup}
                    selectedGroups={selectedGroups}
                  />
                }
              />
              <Route
                path="/min-soknad"
                element={
                  myApplication && !isEditingApplication ? (
                    <ReceiptForm toggleIsEditing={toggleIsEditing} />
                  ) : (
                    <ApplicationForm
                      toggleGroup={toggleGroup}
                      toggleIsEditing={toggleIsEditing}
                      admission={admission}
                      groups={groups ?? []}
                      myApplication={myApplication}
                      selectedGroups={selectedGroups}
                    />
                  )
                }
              />
              <Route
                path="/admin/*"
                element={
                  <RequireAuth auth={isPrivileged}>
                    <AdmissionAdmin />
                  </RequireAuth>
                }
              />
              <Route
                path="/schedule"
                element={
                  <RequireAuth auth={isMember || isPrivileged}>
                    <SchedulePage />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ContentContainer>
      </PageWrapper>
    );
  }
};

export default ApplicationPortal;

const ContentContainer = styled.div`
  width: 100%;
`;

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: calc(100vh - 70px);
`;
