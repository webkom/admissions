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

class UserApplication extends Component {
  constructor(props) {
    super(props);
    this.state = {
      committeeApplications: []
    };
  }

  componentWillMount() {
    const { user, text, committee_applications } = this.props;
    const CommitteeApplications = committee_applications.map(
      (application, i) => {
        this.props.generateCSVData(
          user.full_name,
          user.email,
          user.username,
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
    const priorityText =
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Maecenas eget vulputate ligula. Morbi vel elit vitae purus venenatis aliquet ut sit amet orci. Aenean ligula risus, vestibulum nec pulvinar eget, vulputate sit amet nisi. ";

    const { user, text, time_sent } = this.props;
    const { committeeApplications } = this.state;
    const numApplications = committeeApplications.length;

    return (
      <Wrapper>
        <Header>
          <Name>{user.full_name}</Name>
          <span>
            {numApplications} {numApplications == 1 ? "søknad" : "søknader"}
          </span>
        </Header>
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

        <PriorityText text={priorityText} />
        <h3>Søknader: </h3>
        {committeeApplications}
      </Wrapper>
    );
  }
}

export default UserApplication;
