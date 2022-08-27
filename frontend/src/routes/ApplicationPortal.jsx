import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import styled from "styled-components";

import {
  getSelectedGroupsDraft,
  saveSelectedGroupsDraft,
} from "src/utils/draftHelper";
import djangoData from "src/utils/djangoData";
import draftIsNewerThanApplication from "src/utils/draftIsNewerThanApplication";

import { useAdmission, useMyApplication, useGroups } from "src/query/hooks";

import ApplicationForm from "src/routes/ApplicationForm";
import ReceiptForm from "src/routes/ReceiptForm";
import GroupsPage from "src/routes/GroupsPage";
import AdminPage from "src/routes/AdminPage";
import AdminPageAbakusLeaderView from "src/routes/AdminPageAbakusLeaderView";

import LoadingBall from "src/components/LoadingBall";
import NavBar from "src/components/NavBar";

const ApplicationPortal = () => {
  const [selectedGroups, setSelectedGroups] = useState({});
  const [isEditingApplication, setIsEditingApplication] = useState(true);

  const location = useLocation();

  const { data: groups, isFetching } = useGroups();
  const { data: myApplication } = useMyApplication();
  const { data: admission, error } = useAdmission();

  const toggleGroup = (name) => {
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
    setIsEditingApplication(draftIsNewerThanApplication(myApplication));
    if (!myApplication) return;
    setSelectedGroups(
      myApplication.group_applications
        .map((a) => a.group.name.toLowerCase())
        .reduce((obj, a) => ({ ...obj, [a]: true }), {})
    );
  }, [myApplication]);

  useEffect(() => {
    persistState();
  }, [selectedGroups]);

  useEffect(() => {
    persistState();
  }, [isEditingApplication]);

  if (!djangoData.user) {
    return null;
  } else if (error) {
    return <div>Error: {error.message}</div>;
  } else if (isFetching) {
    return <LoadingBall />;
  } else {
    return (
      <PageWrapper>
        <NavBar user={djangoData.user} isEditing={isEditingApplication} />
        <ContentContainer>
          {location.pathname.startsWith("/velg-komiteer") && (
            <GroupsPage
              toggleGroup={toggleGroup}
              selectedGroups={selectedGroups}
            />
          )}
          {location.pathname.startsWith("/min-soknad") ? (
            myApplication && !isEditingApplication ? (
              <ReceiptForm toggleIsEditing={toggleIsEditing} />
            ) : (
              <ApplicationForm
                toggleGroup={toggleGroup}
                toggleIsEditing={toggleIsEditing}
                admission={admission}
                groups={groups}
                myApplication={myApplication}
                selectedGroups={selectedGroups}
                isEditingApplication={isEditingApplication}
              />
            )
          ) : null}
          {location.pathname.startsWith("/admin") &&
            (djangoData.user.is_superuser ? (
              <AdminPageAbakusLeaderView />
            ) : (
              <AdminPage />
            ))}
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
