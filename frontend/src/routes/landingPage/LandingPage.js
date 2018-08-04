import React, { Component } from "react";
import Moment from "react-moment";
import "moment/locale/nb";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import AbakusLogo from "src/components/AbakusLogo";
import LinkButton from "src/components/LinkButton";
import { Card, CardTitle, CardParagraph } from "src/components/Card";
import { MainPageTitle } from "src/components/PageTitle";
import LinkWrapper from "./LinkWrapper";

import "./LandingPage.css";

Moment.globalLocale = "nb";

class LandingPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      results: undefined,
      admission: [],
      error: null,
      adminPermissions: false
    };

    const hostname = window && window.location && window.location.hostname;
    if (hostname === "opptak.abakus.no") {
      this.API_ROOT = "https://opptak.abakus.no";
    } else {
      this.API_ROOT = "http://localhost:8000";
    }
  }

  componentDidMount() {
    fetch(`${this.API_ROOT}/api/admission/`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    })
      .then(results => results.json())
      .then(
        data => {
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
    const { error, admission, adminPermissions } = this.state;
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
              Søknadsfristen for ny søknad er <b>
                <Moment format="dddd Do MMMM, \k\l. HH:mm">
                  {admission.public_deadline}
                </Moment>
              </b>.
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
              </b>.
            </CardParagraph>
          </Card>
          <LinkWrapper>
            <LinkButton to="/committees">Gå til søknad</LinkButton>
            {adminPermissions && (
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
