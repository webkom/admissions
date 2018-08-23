import React, { Component } from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

import callApi from "src/utils/callApi";
import djangoData from "src/utils/djangoData";

import ApplicationForm from "src/routes/ApplicationForm";
import CommitteesPage from "src/routes/CommitteesPage";
import AdminPage from "src/routes/AdminPage";
import AdminPageAbakusLeaderView from "src/routes/AdminPageAbakusLeaderView";

import Raven from "raven-js";
import AbakusLogo from "src/components/AbakusLogo";
import UserInfo from "src/components/UserInfo";
import PageWrapper from "src/components/PageWrapper";

class ApplicationPortal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      results: undefined,
      committees: [],
      error: null,
      selectedCommittees: {},
      user: { name: "" }
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
    var selectedCommitteesJSON = JSON.stringify(this.state.selectedCommittees);
    sessionStorage.setItem("selectedCommittees", selectedCommitteesJSON);
  };

  initializeState = () => {
    var selectedCommitteesJSON = sessionStorage.getItem("selectedCommittees");
    var selectedCommittees = JSON.parse(selectedCommitteesJSON);

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
        console.log(error);
        this.setState({ error });
      }
    );

    const user = { name: djangoData.user && djangoData.user.full_name };
    this.setState({ user });
    Raven.setUserContext(user);
    this.initializeState();
  }

  render() {
    const { error, user } = this.state;
    const { location } = this.props;
    if (error) {
      return <div>Error: {error.message}</div>;
    } else {
      return (
        <PageWrapper>
          <AbakusLogo size={"6em"} />
          <UserInfo name={user.name} />
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
            {location.pathname.startsWith("/admin") && (
              <AdminPageAbakusLeaderView {...this.state} />
            )}
          </ContentContainer>
        </PageWrapper>
      );
    }
  }
}
const ContentContainer = styled.div`
  width: 100%;
`;
export default ApplicationPortal;
