import React from "react";

import ReadMore from "src/components/ReadMore";

import Wrapper from "./Wrapper";
import GroupName from "./GroupName";
import GroupLogo from "./GroupLogo";
import SmallDescription from "./SmallDescription";
import SmallDescriptionWrapper from "./SmallDescriptionWrapper";

import DeleteApplication from "src/components/Application/DeleteApplication";
import { Group } from "src/types";

interface ApplicationAdminViewProps {
  group: Group;
  text: string;
  applicationId: number;
}

const ApplicationAdminView: React.FC<ApplicationAdminViewProps> = ({
  group,
  text,
  applicationId,
}) => {
  return (
    <Wrapper>
      <GroupLogo src={group.logo} />
      <SmallDescriptionWrapper>
        <SmallDescription>Søknad til ...</SmallDescription>
        <GroupName>{group.name} </GroupName>
        <ReadMore truncateLength={200} text={text} />
        <DeleteApplication
          applicationId={applicationId}
          groupName={group.name}
        />
      </SmallDescriptionWrapper>
    </Wrapper>
  );
};

export default ApplicationAdminView;
