import React, { Component } from "react";

import callApi from "src/utils/callApi";

import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

import PageWrapper from "src/components/PageWrapper";
import AbakusLogo from "src/components/AbakusLogo";
import UserInfo from "src/components/UserInfo";
import Button from "src/components/Button";

const Image = styled.img`
  height: 10em;
  width: 10em;
  margin: 30px;
`;

const Logo = ({ className, name }) => (
  <Image
    className={className}
    alt="Logo"
    src={require(`assets/committee_logos/${name.toLowerCase()}.png`)}
  />
);

const ApplicationContainer = styled.div`
  padding: 20px;
  display: flex;
  flex: 0.5 0.5 50%;
  ${media.handheld`
    flex: 1;
    flex-direction: column;
  `};
`;

const ApplicationTextContainer = styled.div`
  min-width: 200px;
  max-width: 400px;
`;

const Application = ({ committee, text }) => (
  <ApplicationContainer>
    <Logo name={committee.name} />
    <ApplicationTextContainer>
      <h2>{committee.name}</h2>
      <h4>Din søknadstekst:</h4>
      <div>{text}</div>
    </ApplicationTextContainer>
  </ApplicationContainer>
);

const ApplicationComment = ({ text }) => (
  <div>
    <h4>Din kommentar til søknaden:</h4>
    <div>{text}</div>
  </div>
);

const HeaderContainer = styled.div`
  max-width: 550px;
  padding: 20px;
`;

const Header = ({ text, time, phoneNumber }) => (
  <HeaderContainer>
    <h1>Søknaden din er registrert!</h1>
    <div>Søknad registrert: {new Date(time).toLocaleString("en-GB")}</div>
    <Button
      onClick={() => {
        window.location = "/application";
      }}
    >
      Endre søknad
    </Button>
    <ApplicationComment text={text} />
    <div>
      <h4>Oppgitt telefon nummer:</h4>
      <div>{phoneNumber}</div>
    </div>
  </HeaderContainer>
);

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const ApplicationList = styled.div`
  display: flex;
  flex-wrap: wrap;
`;

class MyApplications extends Component {
  state = {};
  componentDidMount() {
    callApi("/application/mine/").then(({ jsonData }) =>
      this.setState({ ...jsonData })
    );
  }
  render() {
    const {
      user,
      text,
      committee_applications,
      time_sent,
      phone_number
    } = this.state;
    return user ? (
      <PageWrapper>
        <Container>
          <AbakusLogo size={"6em"} />
          <UserInfo name={user.full_name} />
          <Header text={text} time={time_sent} phoneNumber={phone_number} />
          <ApplicationList>
            {committee_applications.map(application => (
              <Application key={application.committee.pk} {...application} />
            ))}
          </ApplicationList>
        </Container>
      </PageWrapper>
    ) : (
      <PageWrapper>
        <Container>
          <AbakusLogo size={"6em"} />
          <h1>Du har ikke sendt inn søknad</h1>
          <Button
            onClick={() => {
              window.location = "/application";
            }}
          >
            Det kan du gjøre her!
          </Button>
        </Container>
      </PageWrapper>
    );
  }
}

export default MyApplications;
