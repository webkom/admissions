import React, { Component } from "react";
import styled from "styled-components";

import callApi from "src/utils/callApi";
import djangoData from "src/utils/djangoData";

import ApplicationForm from "src/routes/ApplicationForm";
import CommitteesPage from "src/routes/CommitteesPage";
import AdminPage from "src/routes/AdminPage";
import MyApplications from "src/routes/MyApplications";
import AdminPageAbakusLeaderView from "src/routes/AdminPageAbakusLeaderView";

import Raven from "raven-js";
import PageWrapper from "src/components/PageWrapper";
import NavBar from "src/components/NavBar";

class ApplicationPortal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      results: undefined,
      committees: [],
      error: null,
      selectedCommittees: {},
      user: null,
      isEditingApplication: false
    };
  }

  startApplying = () => {
    const { selectedCommittees } = this.state;
    const committees = Object.keys(selectedCommittees).filter(
      committee => selectedCommittees[committee]
    );
    this.props.startApplying(committees);
  };

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

  persistState = () => {
    const selectedCommitteesJSON = JSON.stringify(
      this.state.selectedCommittees
    );
    sessionStorage.setItem("selectedCommittees", selectedCommitteesJSON);
  };

  initializeState = () => {
    const selectedCommitteesJSON = sessionStorage.getItem("selectedCommittees");
    const selectedCommittees = JSON.parse(selectedCommitteesJSON);

    if (selectedCommittees != null) {
      this.setState({
        selectedCommittees: selectedCommittees
      });
    }
  };

  componentDidMount() {
    callApi("/committee/").then(
      ({ jsonData }) => {
        this.setState({
          committees: jsonData
        });
      },
      error => {
        this.setState({ error });
      }
    );
    djangoData.user &&
      djangoData.user.has_application &&
      callApi("/application/mine/").then(({ jsonData }) =>
        this.setState({
          myApplications: jsonData,
          selectedCommittees: jsonData.committee_applications
            .map(a => a.committee.name.toLowerCase())
            .reduce((obj, a) => ({ ...obj, [a]: true }), {})
        })
      );
    this.setState({ user: djangoData.user });
    Raven.setUserContext(djangoData.user);
    this.initializeState();
  }

  render() {
    const { error, user, myApplications, isEditingApplication } = this.state;
    const { location } = this.props;

    if (!user) {
      return null;
    }

    return error ? (
      <div>Error: {error.message}</div>
    ) : (
      <PageWrapper>
        <NavBar user={user} isEditing={isEditingApplication} />
        <ContentContainer>
          {location.pathname.startsWith("/committees") && (
            <CommitteesPage
              {...this.state}
              toggleCommittee={this.toggleCommittee}
            />
          )}
          {location.pathname.startsWith("/application") && (
            <ApplicationForm
              {...this.state}
              toggleCommittee={this.toggleCommittee}
            />
          )}
          {location.pathname.startsWith("/myapplications") && (
            <MyApplications applications={myApplications} />
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

export default ApplicationPortal;

/** Styles **/

const ContentContainer = styled.div`
  width: 100%;
`;
