import React from "react";
import Moment from "react-moment";
import "moment/locale/nb";
Moment.globalLocale = "nb";

import Icon from "src/components/Icon";
import Application from "src/components/Application";
import CollapseContainer from "src/containers/CollapseContainer";

import Wrapper from "./Wrapper";
import Name from "./Name";
import SmallDescription from "./SmallDescription";
import SmallDescriptionWrapper from "./SmallDescriptionWrapper";
import Header from "./Header";

const UserApplication = ({
  user,
  group_applications,
  created_at,
  updated_at,
  applied_within_deadline,
  phone_number,
  pk,
}) => (
  <Wrapper>
    <CollapseContainer
      header={
        <Header>
          <Name>{user.full_name}</Name>
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
                <Moment format="dddd Do MMMM, \k\l. HH:mm">{created_at}</Moment>
              </div>
              <div>
                <SmallDescription> Oppdatert </SmallDescription>
                <Moment format="dddd Do MMMM, \k\l. HH:mm">{updated_at}</Moment>
              </div>
            </SmallDescriptionWrapper>
          </Header>
          {group_applications.map((groupApplication) => (
            <Application
              applicationId={pk}
              key={user.username + "-" + groupApplication.group.name}
              text={groupApplication.text}
            />
          ))}
        </div>
      }
    />
  </Wrapper>
);

export default UserApplication;
