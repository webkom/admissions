import React, { Component } from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

import ApplicationForm from "src/routes/ApplicationForm";
import CommitteesPage from "src/routes/CommitteesPage";

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

    const hostname = window && window.location && window.location.hostname;
    if (hostname === "opptak.abakus.no") {
      this.API_ROOT = "https://opptak.abakus.no";
    } else {
      this.API_ROOT = "http://localhost:8000";
    }
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
    fetch(`${this.API_ROOT}/api/committee/`, {
      method: "GET",
      headers: new Headers({
        Accept: "application/json",
        "Content-Type": "application/json",
        "Access-Control-Allow-Credentials": true
      }),
      redirect: "manual",
      credentials: "include"
    })
      .then(res => {
        if (res.type === "opaqueredirect") {
          window.location = `http://localhost:8000/login/lego/?next=${
            window.location.pathname
          }`;
          throw res;
        }
        return res;
      })
      .then(results => results.json())
      .then(
        data => {
          this.setState({
            committees: data
          });
        },
        error => {
          console.log(error);
          this.setState({ error });
        }
      );

    this.setState({ user: { name: window.django.user.full_name } });
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
            {location.pathname.startsWith("/committees") ? (
              <CommitteesPage
                {...this.state}
                toggleCommittee={this.toggleCommittee}
              />
            ) : (
              <ApplicationForm
                {...this.state}
                apiRoot={this.API_ROOT}
                toggleCommittee={this.toggleCommittee}
              />
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
