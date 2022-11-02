import React, { useMemo } from "react";
import FormatTime from "src/components/Time/FormatTime";

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
import { useAdmission } from "src/query/hooks";
import { useParams } from "react-router-dom";

const UserApplicationAdminView = ({
  user,
  text,
  group_applications,
  created_at,
  updated_at,
  applied_within_deadline,
  phone_number,
  pk,
}) => {
  const { admissionId } = useParams();
  const {
    data: { groups },
  } = useAdmission(admissionId);

  const sortedGroupApplications = useMemo(() =>
    [...group_applications].sort((a, b) =>
      a.group.name.localeCompare(b.group.name)
    )
  );

  const numApplications = sortedGroupApplications.length;
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
            <PriorityText text={priorityText} />
            {sortedGroupApplications.map((application) => (
              <ApplicationAdminView
                key={user.username + "-" + application.group.name}
                group={groups.find(
                  (group) => group.pk === application.group.pk
                )}
                applicationId={pk}
                text={application.text}
              />
            ))}
          </div>
        }
      />
    </Wrapper>
  );
};

export default UserApplicationAdminView;
