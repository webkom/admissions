import React, { Component } from "react";
import Moment from "react-moment";
import "moment/locale/nb";
Moment.globalLocale = "nb";

import ApplicationAdminView from "src/components/ApplicationAdminView";
import CollapseContainer from "src/containers/CollapseContainer";
import Icon from "src/components/Icon";

import Wrapper from "./Wrapper";
import Name from "./Name";
import PriorityText from "./PriorityText";
import SmallDescription from "./SmallDescription";
import SmallDescriptionWrapper from "./SmallDescriptionWrapper";
import Header from "./Header";
import NumApplications from "./NumApplications";

class UserApplicationAdminView extends Component {
  constructor(props) {
    super(props);
    this.state = {
      groupApplications: [],
    };
  }

  componentDidMount() {
    const {
      user,
      text,
      group_applications,
      created_at,
      updated_at,
      applied_within_deadline,
      phone_number,
      pk,
    } = this.props;

    group_applications.sort(function (a, b) {
      if (a.group.name < b.group.name) return -1;
      if (a.group.name > b.group.name) return 1;
      return 0;
    });

    const GroupApplications = group_applications.map((application, i) => {
      this.props.generateCSVData(
        user.full_name,
        user.email,
        user.username,
        created_at,
        updated_at,
        applied_within_deadline,
        text,
        application.group.name,
        application.text,
        phone_number
      );

      return (
        <ApplicationAdminView
          key={user.username + "-" + i}
          group={application.group.name}
          applicationId={pk}
          text={application.text}
        />
      );
    });

    this.setState({ groupApplications: GroupApplications });
  }

  render() {
    const {
      user,
      text,
      created_at,
      updated_at,
      applied_within_deadline,
      phone_number,
    } = this.props;
    const { groupApplications } = this.state;
    const numApplications = groupApplications.length;
    const priorityText = text ? text : <i>Ingen kommentarer.</i>;
    return (
      <Wrapper>
        <CollapseContainer
          header={
            <Header>
              <Name>{user.full_name}</Name>
              <NumApplications>
                {!applied_within_deadline && (
                  <Icon
                    name="stopwatch"
                    iconPrefix="ios"
                    size="1.5rem"
                    title="Søkte etter fristen"
                    color="#c0392b"
                    padding="0 10px 0 0"
                  />
                )}
                {numApplications} {numApplications == 1 ? "søknad" : "søknader"}
              </NumApplications>
            </Header>
          }
          content={
            <div>
              <Header>
                <SmallDescriptionWrapper>
                  <SmallDescription> Brukernavn </SmallDescription>
                  {user.username}
                </SmallDescriptionWrapper>
                <SmallDescriptionWrapper>
                  <SmallDescription> Tlf. </SmallDescription> {phone_number}
                </SmallDescriptionWrapper>
                <SmallDescriptionWrapper>
                  <SmallDescription> E-mail </SmallDescription> {user.email}
                </SmallDescriptionWrapper>
                <SmallDescriptionWrapper>
                  <div>
                    <SmallDescription> Sendt </SmallDescription>
                    <Moment format="dddd Do MMMM, \k\l. HH:mm">
                      {created_at}
                    </Moment>
                  </div>
                  <div>
                    <SmallDescription> Oppdatert </SmallDescription>
                    <Moment format="dddd Do MMMM, \k\l. HH:mm">
                      {updated_at}
                    </Moment>
                  </div>
                </SmallDescriptionWrapper>
              </Header>
              <PriorityText text={priorityText} />
              {groupApplications}
            </div>
          }
        />
      </Wrapper>
    );
  }
}

export default UserApplicationAdminView;
