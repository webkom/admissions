import React, { useEffect, useState } from "react";
import styled from "styled-components";

import callApi from "src/utils/callApi";
import djangoData from "src/utils/djangoData";

import ApplicationForm from "src/routes/ApplicationForm";
import CommitteesPage from "src/routes/CommitteesPage";
import AdminPage from "src/routes/AdminPage";
import AdminPageAbakusLeaderView from "src/routes/AdminPageAbakusLeaderView";

import LoadingBall from "src/components/LoadingBall";

import * as Sentry from "@sentry/browser";
import NavBar from "src/components/NavBar";
import { useLocation } from "react-router-dom";

const ApplicationPortal = () => {
  const [admission, setAdmission] = useState(null);
  const [results] = useState(undefined);
  const [committees, setCommittees] = useState([]);
  const [error, setError] = useState(null);
  const [isFetching, setIsFetching] = useState(true);
  const [myApplication, setMyApplication] = useState(undefined);
  const [selectedCommittees, setSelectedCommittees] = useState({});
  const [user, setUser] = useState(null);
  const [isEditingApplication, setIsEditingApplication] = useState(true);

  const location = useLocation();

  const toggleCommittee = (name) => {
    setSelectedCommittees({
      ...selectedCommittees,
      [name.toLowerCase()]: !selectedCommittees[name],
    });
  };

  const toggleIsEditing = () => {
    setIsEditingApplication(!isEditingApplication);
  };

  const persistState = () => {
    const selectedCommitteesJSON = JSON.stringify(selectedCommittees);
    sessionStorage.setItem("selectedCommittees", selectedCommitteesJSON);
    sessionStorage.setItem("isEditingApplication", isEditingApplication);
  };

  const initializeState = () => {
    const selectedCommitteesJSON = sessionStorage.getItem("selectedCommittees");
    const isEditingApplicationJSON = sessionStorage.getItem(
      "isEditingApplication",
      true
    );
    const selectedCommittees = JSON.parse(selectedCommitteesJSON);
    const isEditingApplication = JSON.parse(isEditingApplicationJSON);

    if (selectedCommittees != null) {
      setSelectedCommittees(selectedCommittees);
      setIsEditingApplication(isEditingApplication);
    }
  };

  useEffect(() => {
    callApi("/committee/").then(
      ({ jsonData }) => {
        setCommittees(jsonData);
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
        setSelectedCommittees(
          jsonData.committee_applications
            .map((a) => a.committee.name.toLowerCase())
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
  }, [selectedCommittees]);

  useEffect(() => {
    persistState();
    callApi("/application/mine/").then(({ jsonData }) => {
      setMyApplication(jsonData);
      setSelectedCommittees(
        jsonData.committee_applications
          .map((a) => a.committee.name.toLowerCase())
          .reduce((obj, a) => ({ ...obj, [a]: true }), {})
      );
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
            <CommitteesPage
              toggleCommittee={toggleCommittee}
              admission={admission}
              results={results}
              committees={committees}
              error={error}
              isFetching={isFetching}
              myApplication={myApplication}
              selectedCommittees={selectedCommittees}
              user={user}
              isEditingApplication={isEditingApplication}
            />
          )}
          {location.pathname.startsWith("/min-soknad") && (
            <ApplicationForm
              toggleCommittee={toggleCommittee}
              toggleIsEditing={toggleIsEditing}
              admission={admission}
              results={results}
              committees={committees}
              error={error}
              isFetching={isFetching}
              myApplication={myApplication}
              selectedCommittees={selectedCommittees}
              user={user}
              isEditingApplication={isEditingApplication}
            />
          )}
          {location.pathname.startsWith("/admin") &&
            (user.is_superuser ? (
              <AdminPageAbakusLeaderView
                admission={admission}
                results={results}
                committees={committees}
                error={error}
                isFetching={isFetching}
                myApplication={myApplication}
                selectedCommittees={selectedCommittees}
                user={user}
                isEditingApplication={isEditingApplication}
              />
            ) : (
              <AdminPage
                admission={admission}
                results={results}
                committees={committees}
                error={error}
                isFetching={isFetching}
                myApplication={myApplication}
                selectedCommittees={selectedCommittees}
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
