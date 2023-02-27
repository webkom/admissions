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
import AdminPage from "src/routes/AdminPage";
import AdminPageAbakusLeaderView from "src/routes/AdminPageAbakusLeaderView";

import LoadingBall from "src/components/LoadingBall";
import NavBar from "src/components/NavBar";
import NotFoundPage from "./NotFoundPage";

interface SelectedGroups {
  [key: string]: boolean;
}

const ApplicationPortal = () => {
  const { admissionId } = useParams();
  const [selectedGroups, setSelectedGroups] = useState<SelectedGroups>({});
  const [isEditingApplication, setIsEditingApplication] = useState<
    boolean | null
  >(null);

  const { data: myApplication } = useMyApplication(admissionId ?? "");
  const {
    data: admission,
    isFetching,
    error,
  } = useAdmission(admissionId ?? "");
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
    if (error.code === 404) {
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
              path="/velg-komiteer"
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
              path="/admin"
              element={
                djangoData.user.is_superuser ? (
                  <AdminPageAbakusLeaderView />
                ) : (
                  <AdminPage />
                )
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
  min-height: 100vh;
`;
