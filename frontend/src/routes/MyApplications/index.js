import React from "react";
import Button from "src/components/Button";
import {
  Wrapper,
  Image,
  HeaderWrapper,
  Container,
  List,
  HeaderText,
  TimeStamp,
  Phone,
  ChangeButton,
  DeleteButton,
  AppHeader
} from "./styles.js";
import Card from "src/components/Card/Card";
import callApi from "src/utils/callApi";

const Logo = ({ className, name }) => (
  <Image
    className={className}
    alt="Logo"
    src={require(`assets/committee_logos/${name.toLowerCase()}.png`)}
  />
);

const Application = ({ committee, text }) => (
  <Wrapper>
    <Logo name={committee.name} style={{ gridArea: "logo" }} />
    <AppHeader>{committee.name}</AppHeader>
    <div style={{ gridArea: "appContent" }}>{text}</div>
  </Wrapper>
);

const ApplicationComment = ({ text }) => (
  <div>
    <h4 style={{ textAlign: "center" }}>Din kommentar til søknaden</h4>
    <div style={{ marginTop: "-1em" }}>{text}</div>
  </div>
);

const Header = ({ text, time, phoneNumber, deadline }) => (
  <HeaderWrapper>
    <HeaderText>Søknaden din er registrert!</HeaderText>
    <TimeStamp deadline={deadline}>
      Søknad registrert: {new Date(time).toLocaleString("en-GB")}
    </TimeStamp>
    <Phone>
      <span style={{ fontWeight: "bold" }}>Oppgitt telefonnummer: </span>
      {phoneNumber}
    </Phone>
    <ChangeButton to="/application">Endre søknad</ChangeButton>
    <ApplicationComment text={text} />
  </HeaderWrapper>
);

const MyApplications = ({ applications }) => {
  if (!applications) {
    return (
      <Container>
        <h1>Du har ikke sendt inn søknad</h1>
        <Button
          onClick={() => {
            window.location = "/application";
          }}
        >
          Det kan du gjøre her!
        </Button>
      </Container>
    );
  }
  const {
    text,
    committee_applications,
    time_sent,
    applied_within_deadline,
    phone_number
  } = applications;
  return (
    <Container>
      <Header
        text={text}
        time={time_sent}
        phoneNumber={phone_number}
        deadline={applied_within_deadline}
      />
      <List text={text} time={time_sent} phoneNumber={phone_number}>
        {committee_applications.map(application => (
          <Card key={application.committee.pk}>
            <Application {...application} />
          </Card>
        ))}
      </List>
      <DeleteButton to="/" onClick={() => callApi("/application/mine/", {
        method: "DELETE"
      }).then(
        () => {
          window.location = "/";
        }
      )}>
        Slett søknad
      </DeleteButton>
    </Container>
  );
};

export default MyApplications;
