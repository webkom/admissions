import React, { Component } from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

import callApi from "src/utils/callApi";
import Moment from "react-moment";
import "moment/locale/nb";
Moment.globalLocale = "nb";

import djangoData from "src/utils/djangoData";
import AbakusLogo from "src/components/AbakusLogo";
import LinkButton from "src/components/LinkButton";
import { Card, CardTitle, CardParagraph } from "src/components/Card";
import { MainPageTitle } from "src/components/PageTitle";

import LinkWrapper from "./LinkWrapper";
import "./LandingPage.css";

class LandingPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      results: undefined,
      admission: [],
      error: null,
      adminPermissions: true,
      hasSubmitted: false
    };
  }

  componentDidMount() {
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
    djangoData.user.full_name &&
      callApi("/application/mine/").then(
        () =>
          this.setState({
            hasSubmitted: true
          }),
        () => this.setState({ hasSubmitted: false })
      );
  }

  render() {
    const { error, admission, adminPermissions, hasSubmitted } = this.state;
    if (error) {
      return <div>Error: {error.message}</div>;
    } else {
      return (
        <Container>
          <AbakusLogo />
          <MainPageTitle>Opptak til komiteer i Abakus</MainPageTitle>
          <PageSubTitle>
            <Moment format="YYYY">{admission.public_deadline}</Moment>
          </PageSubTitle>
          <Card margin={"1em 1em 2.5em 1em"}>
            <CardTitle>Her kan du søke til komiteer i Abakus</CardTitle>
            <CardParagraph lineHeight="1em">
              Søknadsfristen for ny søknad er
              <b>
                <Moment format="dddd Do MMMM, \k\l. HH:mm">
                  {admission.public_deadline}
                </Moment>
              </b>
              .
            </CardParagraph>
            <CardParagraph lineHeight="1em">
              Søker du etter dette er du ikke garantert intervju.
            </CardParagraph>
            <CardParagraph lineHeight="1em">
              Fristen for å endre søknad er{" "}
              <b>
                <Moment format="dddd Do MMMM, \k\l. HH:mm">
                  {admission.application_deadline}
                </Moment>
              </b>
              .
            </CardParagraph>
          </Card>
          <LinkWrapper>
            {djangoData.user.full_name ? (
              <LinkButton to={hasSubmitted ? "/myapplications" : "/committees"}>
                Gå til søknad
              </LinkButton>
            ) : (
              <LinkButton
                to="/"
                onClick={e => {
                  window.location = `/login/lego/?next=${
                    window.location.pathname
                  }`;
                  e.preventDefault();
                }}
              >
                Logg inn
              </LinkButton>
            )}
            {djangoData.user.is_board_member && (
              <LinkButton to="/admin">Gå til admin panel</LinkButton>
            )}
          </LinkWrapper>
        </Container>
      );
    }
  }
}

const PageSubTitle = MainPageTitle.extend`
  color: gray;
  font-size: 2.5rem;
`;

const Container = styled.div`
  min-height: 100vh;
  margin: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin: 0 0.7em;
  ${media.handheld`
    margin: 0 0.7em 3em 0.7em;
    `};
`;

export default LandingPage;
