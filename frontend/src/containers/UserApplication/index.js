import React, { Component } from "react";
import Moment from "react-moment";
import "moment/locale/nb";
Moment.globalLocale = "nb";

import Application from "src/components/Application";

import Wrapper from "./Wrapper";
import Name from "./Name";
import PriorityText from "./PriorityText";
import SmallDescription from "./SmallDescription";
import SmallDescriptionWrapper from "./SmallDescriptionWrapper";
import Header from "./Header";
import NumApplications from "./NumApplications";

class UserApplication extends Component {
  constructor(props) {
    super(props);
    this.state = {
      committeeApplications: []
    };
  }

  componentWillMount() {
    const { user, text, committee_applications, time_sent } = this.props;
    committee_applications.sort(function(a, b) {
      if (a.committee.name < b.committee.name) return -1;
      if (a.committee.name > b.committee.name) return 1;
      return 0;
    });
    const CommitteeApplications = committee_applications.map(
      (application, i) => {
        this.props.generateCSVData(
          user.full_name,
          user.email,
          user.username,
          time_sent,
          text,
          application.committee.name,
          application.text
        );

        return (
          <Application
            key={user.username + "-" + i}
            committee={application.committee.name}
            text={application.text}
          />
        );
      }
    );

    this.setState({ committeeApplications: CommitteeApplications });
  }

  render() {
    const { user, text, time_sent } = this.props;
    const { committeeApplications } = this.state;
    const numApplications = committeeApplications.length;
    console.log("userprops", this.props);
    return (
      <Wrapper>
        <Header>
          <Name>{user.full_name}</Name>
          <NumApplications>
            {numApplications} {numApplications == 1 ? "søknad" : "søknader"}
          </NumApplications>
        </Header>
        <Header>
          <SmallDescriptionWrapper>
            <SmallDescription> Brukernavn </SmallDescription> {user.username}
          </SmallDescriptionWrapper>
          <SmallDescriptionWrapper>
            <SmallDescription> E-mail </SmallDescription> {user.email}
          </SmallDescriptionWrapper>
          <SmallDescriptionWrapper>
            <SmallDescription> Sendt </SmallDescription>
            <Moment format="dddd Do MMMM, \k\l. HH:mm">{time_sent}</Moment>
          </SmallDescriptionWrapper>
        </Header>
        <PriorityText text={text} />
        {committeeApplications}
      </Wrapper>
    );
  }
}

export default UserApplication;
