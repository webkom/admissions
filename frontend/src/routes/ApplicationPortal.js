import React, { Component } from "react";
import styled from "styled-components";
import FormikApp from "src/routes/applicationForm/FormikApp";
import CommitteesPage from "src/routes/committeesPage/CommitteesPage";
import { media } from "src/styles/mediaQueries";
import AbakusLogo from "src/components/AbakusLogo";

class ApplicationPortal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      results: undefined,
      committees: [],
      error: null,
      selectedCommittees: {}
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
    this.setState(state => ({
      selectedCommittees: {
        ...state.selectedCommittees,
        [name.toLowerCase()]: !state.selectedCommittees[name]
      }
    }));
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
  }

  render() {
    const { error } = this.state;
    const { location } = this.props;
    if (error) {
      return <div>Error: {error.message}</div>;
    } else {
      return (
        <PageContainer>
          <AbakusLogo size={"6em"} />
          <ContentContainer>
            {location.pathname.startsWith("/committees") ? (
              <CommitteesPage
                {...this.state}
                toggleCommittee={this.toggleCommittee}
              />
            ) : (
              <FormikApp
                {...this.state}
                apiRoot={this.API_ROOT}
                toggleCommittee={this.toggleCommittee}
              />
            )}
          </ContentContainer>
        </PageContainer>
      );
    }
  }
}
const ContentContainer = styled.div`
  width: 100%;
`;
const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 70em;
  margin: 0 auto;
  min-height: 100vh;
  ${media.handheld`
    width: 95vw;
    `};
`;

export default ApplicationPortal;
