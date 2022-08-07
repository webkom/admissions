import React, { useEffect, useState } from "react";
import styled from "styled-components";

import callApi from "src/utils/callApi";
import djangoData from "src/utils/djangoData";

import ApplicationForm from "src/routes/ApplicationForm";
import GroupsPage from "src/routes/GroupsPage";
import AdminPage from "src/routes/AdminPage";
import AdminPageAbakusLeaderView from "src/routes/AdminPageAbakusLeaderView";

import LoadingBall from "src/components/LoadingBall";

import * as Sentry from "@sentry/browser";
import NavBar from "src/components/NavBar";
import { useLocation } from "react-router-dom";

const ApplicationPortal = () => {
  const [admission, setAdmission] = useState(null);
  const [results] = useState(undefined);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState(null);
  const [isFetching, setIsFetching] = useState(true);
  const [myApplication, setMyApplication] = useState(undefined);
  const [selectedGroups, setSelectedGroups] = useState({});
  const [user, setUser] = useState(null);
  const [isEditingApplication, setIsEditingApplication] = useState(true);

  const location = useLocation();

  const toggleGroup = (name) => {
    setSelectedGroups({
      ...selectedGroups,
      [name.toLowerCase()]: !selectedGroups[name],
    });
  };

  const toggleIsEditing = () => {
    setIsEditingApplication(!isEditingApplication);
  };

  const persistState = () => {
    const selectedGroupsJSON = JSON.stringify(selectedGroups);
    sessionStorage.setItem("selectedGroups", selectedGroupsJSON);
    sessionStorage.setItem("isEditingApplication", isEditingApplication);
  };

  const initializeState = () => {
    const selectedGroupsJSON = sessionStorage.getItem("selectedGroups");
    const isEditingApplicationJSON = sessionStorage.getItem(
      "isEditingApplication",
      true
    );
    const selectedGroups = JSON.parse(selectedGroupsJSON);
    const isEditingApplication = JSON.parse(isEditingApplicationJSON);

    if (selectedGroups != null) {
      setSelectedGroups(selectedGroups);
      setIsEditingApplication(isEditingApplication);
    }
  };

  useEffect(() => {
    callApi("/group/").then(
      ({ jsonData }) => {
        setGroups(jsonData);
        setIsFetching(false);
      },
      (error) => {
        setError(error);
        setIsFetching(false);
      }
    );
    djangoData.user &&
      djangoData.user.has_application &&
      callApi("/application/mine/").then(({ jsonData }) => {
        setMyApplication(jsonData);
        setSelectedGroups(
          jsonData.group_applications
            .map((a) => a.group.name.toLowerCase())
            .reduce((obj, a) => ({ ...obj, [a]: true }), {})
        );
      });
    setUser(djangoData.user);
    Sentry.setUser(djangoData.user);
    initializeState();

    callApi("/admission/").then(
      ({ jsonData: data }) => {
        setAdmission(data[0]);
      },
      (error) => {
        setError(error);
      }
    );
  }, []);

  useEffect(() => {
    persistState();
  }, [selectedGroups]);

  useEffect(() => {
    persistState();
    callApi("/application/mine/").then(({ jsonData }) => {
      setMyApplication(jsonData);
      if (jsonData !== undefined) {
        setSelectedGroups(
          jsonData.group_applications
            .map((a) => a.group.name.toLowerCase())
            .reduce((obj, a) => ({ ...obj, [a]: true }), {})
        );
      }
    });
  }, [isEditingApplication]);

  if (!user) {
    return null;
  } else if (error) {
    return <div>Error: {error.message}</div>;
  } else if (isFetching) {
    return <LoadingBall />;
  } else {
    return (
      <PageWrapper>
        <NavBar user={user} isEditing={isEditingApplication} />
        <ContentContainer>
          {location.pathname.startsWith("/velg-komiteer") && (
            <GroupsPage
              toggleGroup={toggleGroup}
              admission={admission}
              results={results}
              groups={groups}
              error={error}
              isFetching={isFetching}
              myApplication={myApplication}
              selectedGroups={selectedGroups}
              user={user}
              isEditingApplication={isEditingApplication}
            />
          )}
          {location.pathname.startsWith("/min-soknad") && (
            <ApplicationForm
              toggleGroup={toggleGroup}
              toggleIsEditing={toggleIsEditing}
              admission={admission}
              results={results}
              groups={groups}
              error={error}
              isFetching={isFetching}
              myApplication={myApplication}
              selectedGroups={selectedGroups}
              user={user}
              isEditingApplication={isEditingApplication}
            />
          )}
          {location.pathname.startsWith("/admin") &&
            (user.is_superuser ? (
              <AdminPageAbakusLeaderView
                admission={admission}
                results={results}
                groups={groups}
                error={error}
                isFetching={isFetching}
                myApplication={myApplication}
                selectedGroups={selectedGroups}
                user={user}
                isEditingApplication={isEditingApplication}
              />
            ) : (
              <AdminPage
                admission={admission}
                results={results}
                groups={groups}
                error={error}
                isFetching={isFetching}
                myApplication={myApplication}
                selectedGroups={selectedGroups}
                user={user}
                isEditingApplication={isEditingApplication}
              />
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
