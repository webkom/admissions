import React, { Component } from "react";
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

class ApplicationPortal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      admission: null,
      results: undefined,
      committees: [],
      error: null,
      isFetching: true,
      myApplication: undefined,
      selectedCommittees: {},
      user: null,
      isEditingApplication: true
    };
  }

  toggleCommittee = name => {
    this.setState(
      state => ({
        selectedCommittees: {
          ...state.selectedCommittees,
          [name.toLowerCase()]: !state.selectedCommittees[name]
        }
      }),
      () => {
        this.persistState();
      }
    );
  };

  toggleIsEditing = () => {
    this.setState(
      state => ({
        isEditingApplication: !state.isEditingApplication
      }),
      () => {
        this.persistState();
        callApi("/application/mine/").then(({ jsonData }) =>
          this.setState({
            myApplication: jsonData,
            selectedCommittees: jsonData.committee_applications
              .map(a => a.committee.name.toLowerCase())
              .reduce((obj, a) => ({ ...obj, [a]: true }), {})
          })
        );
      }
    );
  };

  persistState = () => {
    const selectedCommitteesJSON = JSON.stringify(
      this.state.selectedCommittees
    );
    sessionStorage.setItem("selectedCommittees", selectedCommitteesJSON);
    sessionStorage.setItem(
      "isEditingApplication",
      this.state.isEditingApplication
    );
  };

  initializeState = () => {
    const selectedCommitteesJSON = sessionStorage.getItem("selectedCommittees");
    const isEditingApplicationJSON = sessionStorage.getItem(
      "isEditingApplication",
      true
    );
    const selectedCommittees = JSON.parse(selectedCommitteesJSON);
    const isEditingApplication = JSON.parse(isEditingApplicationJSON);

    if (selectedCommittees != null) {
      this.setState({
        selectedCommittees: selectedCommittees,
        isEditingApplication: isEditingApplication
      });
    }
  };

  componentDidMount() {
    callApi("/committee/").then(
      ({ jsonData }) => {
        this.setState({
          committees: jsonData,
          isFetching: false
        });
      },
      error => {
        this.setState({ error, isFetching: false });
      }
    );
    djangoData.user &&
      djangoData.user.has_application &&
      callApi("/application/mine/").then(({ jsonData }) =>
        this.setState({
          myApplication: jsonData,
          selectedCommittees: jsonData.committee_applications
            .map(a => a.committee.name.toLowerCase())
            .reduce((obj, a) => ({ ...obj, [a]: true }), {})
        })
      );
    this.setState({ user: djangoData.user });
    Sentry.setUser(djangoData.user);
    this.initializeState();

    callApi("/admission/").then(
      ({ jsonData: data }) => {
        this.setState({
          admission: data[0]
        });
      },
      error => {
        this.setState({ error });
      }
    );
  }

  render() {
    const { error, isFetching, user, isEditingApplication } = this.state;
    const { location } = this.props;

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
                {...this.state}
                toggleCommittee={this.toggleCommittee}
              />
            )}
            {location.pathname.startsWith("/min-soknad") && (
              <ApplicationForm
                {...this.state}
                toggleCommittee={this.toggleCommittee}
                toggleIsEditing={this.toggleIsEditing}
              />
            )}
            {location.pathname.startsWith("/admin") &&
              (user.is_superuser ? (
                <AdminPageAbakusLeaderView {...this.state} />
              ) : (
                <AdminPage {...this.state} />
              ))}
          </ContentContainer>
        </PageWrapper>
      );
    }
  }
}

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
