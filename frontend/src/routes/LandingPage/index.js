import React, { Component } from "react";
import styled from "styled-components";

import callApi from "src/utils/callApi";
import Moment from "react-moment";
import "moment/locale/nb";
Moment.globalLocale = "nb";

import djangoData from "src/utils/djangoData";
import DecorativeLine from "src/components/DecorativeLine";
import LegoButton from "src/components/LegoButton";
import LandingPageSkeleton from "./LandingPageSkeleton";
import LandingPageNoAdmission from "./LandingPageNoAdmission";
import { media } from "src/styles/mediaQueries";
import AdmissionCountDown from "../../components/AdmissionCountDown";

import LoadingBall from "src/components/LoadingBall";

class LandingPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      results: undefined,
      admission: null,
      error: null,
      isLoading: true,
      hasSubmitted: false,
    };
  }

  componentDidMount() {
    callApi("/admission/").then(
      ({ jsonData: data }) => {
        this.setState({
          admission: data[0],
          isLoading: false,
        });
      },
      (error) => {
        this.setState({ error });
      }
    );
    djangoData.user.full_name &&
      callApi("/application/mine/").then(
        (res) => {
          // HTTP 204 will return no content, but the promise is still Fulfilled
          if (res && res.status == 204) {
            this.setState({
              hasSubmitted: false,
            });
          } else {
            this.setState({
              hasSubmitted: true,
              isLoading: false,
            });
          }
        },
        () => this.setState({ hasSubmitted: false })
      );
  }

  render() {
    const { error, isLoading, admission, hasSubmitted } = this.state;
    if (error) {
      return <div>Error: {error.message}</div>;
    }

    if (isLoading) {
      return <LoadingBall />;
    }

    if (!admission) {
      return <LandingPageNoAdmission />;
    }

    return (
      <LandingPageSkeleton>
        <YearOfAdmission>
          <Moment format="YYYY">{admission.public_deadline}</Moment>
        </YearOfAdmission>
        <InfoBox>
          <DecorativeLine vertical red />
          <ApplicationDateInfo admission={admission} />
        </InfoBox>
        <Notice>
          <StyledSpan bold>Merk:</StyledSpan> Oppdateringer etter søknadsfristen
          kan ikke garanteres å bli sett av komiteen(e) du søker deg til.
        </Notice>
        <LinkWrapper>
          {djangoData.user.full_name ? (
            <li>
              <LegoButton
                to={hasSubmitted ? "/min-soknad" : "/velg-komiteer"}
                icon="arrow-forward"
                iconPrefix="ios"
                disabled={!admission.is_open}
              >
                Gå til søknad
              </LegoButton>
            </li>
          ) : (
            <li>
              <LegoButton
                icon="arrow-forward"
                iconPrefix="ios"
                disabled={!admission.is_open}
                onClick={(e) => {
                  window.location = "/login/lego/";
                  e.preventDefault();
                }}
              >
                Gå til søknad
              </LegoButton>
            </li>
          )}

          {djangoData.user.is_privileged && (
            <li>
              <LegoButton
                to="/admin"
                icon="arrow-forward"
                iconPrefix="ios"
                buttonStyle="secondary"
              >
                Gå til admin panel
              </LegoButton>
            </li>
          )}
        </LinkWrapper>
        {!admission.is_open && (
          <AdmissionCountDown endTime={admission.open_from} />
        )}
      </LandingPageSkeleton>
    );
  }
}

export default LandingPage;

const ApplicationDateInfo = ({ admission }) => (
  <div>
    <p>
      Siste frist for å <StyledSpan bold>legge inn en søknad</StyledSpan> er{" "}
      <StyledSpan bold red>
        <Moment format="dddd Do MMMM">{admission.public_deadline}</Moment>
      </StyledSpan>
      <StyledSpan red>
        <Moment format=", \k\l. HH:mm:ss">{admission.public_deadline}</Moment>
      </StyledSpan>
      .
    </p>
  </div>
);

/** Styles **/

const YearOfAdmission = styled.h1`
  color: #aeaeae;
  font-size: 2.5rem;
  font-weight: 500;
`;

const InfoBox = styled.div`
  display: flex;
  max-width: 600px;
  margin-top: 40px;
  p {
    margin: 0 0 0 1rem;
    font-size: 1.1rem;
    line-height: 1.6rem;
    padding: 7px 0;
  }

  ${media.handheld`
    margin: 1rem 0 1.6rem 0;
    max-width: 300px;

    p {
    font-size: 1rem;
    line-height: 1.3rem;
  `};
`;

const StyledSpan = styled.span.attrs((props) => ({
  red: props.red ? true : false,
  bold: props.bold ? "600" : "normal",
}))`
  color: ${(props) => (props.red ? "var(--lego-red)" : "inherit")};
  font-weight: ${(props) => props.bold};
`;

const Notice = styled.p`
  font-style: italic;
  font-size: 1rem;
  max-width: 600px;
  line-height: 1.4rem;

  ${media.handheld`
    margin: 0 0;
    font-size: 0.9rem;
    line-height: 1.1rem;
    max-width: 300px;
  `}
`;

const LinkWrapper = styled.ul`
  margin-top: 1.5rem;
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;

  > li:last-child {
    margin-top: 1rem;
  }

  ${media.handheld`
    margin-top: 2.5rem;
    margin-bottom: 1rem;
  `}
`;
