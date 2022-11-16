import React from "react";

import Icon from "src/components/Icon";
import Application from "src/components/Application";
import CollapseContainer from "src/containers/CollapseContainer";
import FormatTime from "src/components/Time/FormatTime";

import Wrapper from "./Wrapper";
import Name from "./Name";
import SmallDescription from "./SmallDescription";
import SmallDescriptionWrapper from "./SmallDescriptionWrapper";
import Header from "./Header";
import { Application as UserApplicationInterface } from "src/types";

type UserApplicationProps = UserApplicationInterface;

const UserApplication: React.FC<UserApplicationProps> = ({
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
              prefix="ios"
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
                <FormatTime format="EEEE d. MMMM, kl. HH:mm">
                  {created_at}
                </FormatTime>
              </div>
              <div>
                <SmallDescription> Oppdatert </SmallDescription>
                <FormatTime format="EEEE d. MMMM, kl. HH:mm">
                  {updated_at}
                </FormatTime>
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
