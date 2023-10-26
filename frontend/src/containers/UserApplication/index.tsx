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
import {
  Admission,
  Application as UserApplicationInterface,
  Group,
} from "src/types";
import { filterEditableFields } from "src/utils/jsonFieldHelper";

type UserApplicationProps = {
  admission: Admission;
  currentGroup: Group;
} & UserApplicationInterface;

const UserApplication: React.FC<UserApplicationProps> = ({
  admission,
  currentGroup,
  user,
  responses,
  group_applications,
  created_at,
  updated_at,
  applied_within_deadline,
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
            {filterEditableFields(admission.questions).map((question) => (
              <SmallDescriptionWrapper key={question.id}>
                <SmallDescription>{question.name} </SmallDescription>
                {responses[question.id]}
              </SmallDescriptionWrapper>
            ))}
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
              questions={currentGroup.questions}
              responses={groupApplication.responses}
            />
          ))}
        </div>
      }
    />
  </Wrapper>
);

export default UserApplication;
