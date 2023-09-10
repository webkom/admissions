import React, { useEffect, useState } from "react";
import { Route, Routes, useParams } from "react-router-dom";
import styled from "styled-components";

import {
  getIsEditingDraft,
  getSelectedGroupsDraft,
  saveIsEditingDraft,
  saveSelectedGroupsDraft,
} from "src/utils/draftHelper";
import djangoData from "src/utils/djangoData";

import { useAdmission, useMyApplication } from "src/query/hooks";

import ApplicationForm from "src/routes/ApplicationForm";
import ReceiptForm from "src/routes/ReceiptForm";
import GroupsPage from "src/routes/GroupsPage";
import AdmissionAdmin from "src/routes/AdmissionAdmin";

import LoadingBall from "src/components/LoadingBall";
import NavBar from "src/components/NavBar";
import NotFoundPage from "./NotFoundPage";
import RequireAuth from "src/components/RequireAuth";

interface SelectedGroups {
  [key: string]: boolean;
}

const ApplicationPortal = () => {
  const { admissionSlug } = useParams();
  const [selectedGroups, setSelectedGroups] = useState<SelectedGroups>(
    getSelectedGroupsDraft()
  );
  const [isEditingApplication, setIsEditingApplication] = useState<
    boolean | null
  >(null);

  const { data: myApplication } = useMyApplication(admissionSlug ?? "");
  const {
    data: admission,
    isFetching,
    error,
  } = useAdmission(admissionSlug ?? "");
  const { groups } = admission ?? {};

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

  const initializeState = () => {
    const parsedSelectedGroups = getSelectedGroupsDraft();

    if (parsedSelectedGroups != null) {
      setSelectedGroups(parsedSelectedGroups);
    }
  };

  useEffect(() => {
    initializeState();
  }, []);

  useEffect(() => {
    // Only run on first load after myApplication is set
    if (isEditingApplication === null && myApplication !== undefined) {
      // Set to is not editing if myApplication exists (user has submitted an application)
      setIsEditingApplication(!myApplication);
    }
  }, [isEditingApplication, myApplication]);

  useEffect(() => {
    if (isFetching) return;
    setIsEditingApplication(!myApplication || getIsEditingDraft());
    if (!myApplication) return;
    setSelectedGroups(
      myApplication.group_applications
        ?.map((a) => a.group.name.toLowerCase())
        .reduce((obj, a) => ({ ...obj, [a]: true }), {})
    );
  }, [myApplication]);

  useEffect(() => {
    persistState();
  }, [selectedGroups]);

  useEffect(() => {
    persistState();
    if (isEditingApplication === null) return;
    saveIsEditingDraft(isEditingApplication);
  }, [isEditingApplication]);

  if (!djangoData.user) {
    return null;
  } else if (error) {
    if (error.response?.status === 404) {
      return <NotFoundPage />;
    }
    return <div>Error: {error.message}</div>;
  } else if (isFetching) {
    return <LoadingBall />;
  } else {
    return (
      <PageWrapper>
        <NavBar user={djangoData.user} isEditing={!!isEditingApplication} />
        <ContentContainer>
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
                <RequireAuth auth={!!admission?.userdata.is_privileged}>
                  <AdmissionAdmin />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ContentContainer>
      </PageWrapper>
    );
  }
};

export default ApplicationPortal;

/** Styles **/

const ContentContainer = styled.div`
  width: 100%;
`;

/** Styles **/

export const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: calc(100vh - 70px);
`;
