import React, { useMemo } from "react";
import FormatTime from "src/components/Time/FormatTime";

import ApplicationAdminView from "src/components/ApplicationAdminView";
import CollapseContainer from "src/containers/CollapseContainer";
import Icon from "src/components/Icon";
import Wrapper from "src/containers/UserApplication/Wrapper";
import Name from "src/containers/UserApplication/Name";
import PriorityText from "src/containers/UserApplication/PriorityText";
import SmallDescription from "src/containers/UserApplication/SmallDescription";
import SmallDescriptionWrapper from "src/containers/UserApplication/SmallDescriptionWrapper";
import Header from "src/containers/UserApplication/Header";
import NumApplications from "src/containers/UserApplication/NumApplications";
import { useAdmission } from "src/query/hooks";
import { useParams } from "react-router-dom";
import { Application } from "src/types";

type UserApplicationAdminViewProps = Application;

const UserApplicationAdminView: React.FC<UserApplicationAdminViewProps> = ({
  user,
  text,
  group_applications,
  created_at,
  updated_at,
  applied_within_deadline,
  phone_number,
  pk,
}) => {
  const { admissionSlug } = useParams();
  const { data } = useAdmission(admissionSlug ?? "");
  const { groups } = data ?? {};

  const sortedGroupApplications = useMemo(
    () =>
      [...group_applications].sort((a, b) =>
        a.group.name.localeCompare(b.group.name)
      ),
    [group_applications]
  );

  if (!groups) return null;

  const numApplications = sortedGroupApplications.length;
  const priorityText = text ? text : "Ingen kommentarer.";
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
                  prefix="ios"
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
            {sortedGroupApplications.map((application) => {
              const group = groups.find(
                (group) => group.pk === application.group.pk
              );
              if (!group) return <p>Feil: ugyldig gruppe</p>;
              return (
                <ApplicationAdminView
                  key={user.username + "-" + application.group.name}
                  group={group}
                  applicationId={pk}
                  text={application.text}
                />
              );
            })}
          </div>
        }
      />
    </Wrapper>
  );
};

export default UserApplicationAdminView;
