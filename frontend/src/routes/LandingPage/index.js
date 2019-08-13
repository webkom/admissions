import React, { Component } from "react";

import callApi from "src/utils/callApi";
import Moment from "react-moment";
import "moment/locale/nb";
Moment.globalLocale = "nb";

import djangoData from "src/utils/djangoData";
import AbakusLogo from "src/components/AbakusLogo";
import LinkButton from "src/components/LinkButton";
import { MainPageTitle } from "src/components/PageTitle";

import {
  InfoBox,
  InfoBoxText,
  InfoBoxTitle,
  PageSubTitle,
  Container,
  LinkWrapper
} from "./styles";

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
    const { error, admission, hasSubmitted } = this.state;
    if (error) {
      return <div>Error: {error.message}</div>;
    } else if (!admission) {
      return (
        <Container>
          <h1>Ingen aktive opptak for øyeblikket</h1>
          <span>
            <b>Kom tilbake litt senere!</b>
          </span>
        </Container>
      );
    } else {
      return (
        <Container>
          <AbakusLogo />
          <MainPageTitle>Opptak til komiteer i Abakus</MainPageTitle>
          <PageSubTitle>
            <Moment format="YYYY">{admission.public_deadline}</Moment>
          </PageSubTitle>
          <InfoBox>
            <InfoBoxTitle>Her kan du søke til komiteer i Abakus</InfoBoxTitle>
            <InfoBoxText lineHeight="1em">
              Søknadsfristen er{" "}
              <b>
                <Moment format="dddd Do MMMM, \k\l. HH:mm">
                  {admission.public_deadline}
                </Moment>
                .
              </b>
            </InfoBoxText>
            <InfoBoxText>
              <b>Merk!</b> Du kan sende inn/endre din søknad etter fristen, men
              du er verken garantert intervju eller at komiteen ser dine
              endringer. Siste frist for dette er{" "}
              <b>
                <Moment format="dddd Do MMMM, \k\l. HH:mm">
                  {admission.application_deadline}
                </Moment>
              </b>
              .
            </InfoBoxText>
          </InfoBox>
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

export default LandingPage;
