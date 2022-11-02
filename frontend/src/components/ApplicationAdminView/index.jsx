import React from "react";

import ReadMore from "src/components/ReadMore";

import Wrapper from "./Wrapper";
import GroupName from "./GroupName";
import GroupLogo from "./GroupLogo";
import SmallDescription from "./SmallDescription";
import SmallDescriptionWrapper from "./SmallDescriptionWrapper";

import DeleteApplication from "src/components/Application/DeleteApplication";

const ApplicationAdminView = ({ group, text, applicationId }) => {
  const applicationText = text.split("\n").map((line, i, arr) => {
    const linee = <span key={i}>{line}</span>;
    if (i === arr.length - 1) {
      return linee;
    } else {
      return [linee, <br key={i + "br"} />];
    }
  });

  return (
    <Wrapper>
      <GroupLogo src={group.logo} />
      <SmallDescriptionWrapper>
        <SmallDescription>Søknad til ...</SmallDescription>
        <GroupName>{group.name} </GroupName>
        <ReadMore lines={3}>{applicationText}</ReadMore>
        <DeleteApplication
          applicationId={applicationId}
          groupName={group.name}
        />
      </SmallDescriptionWrapper>
    </Wrapper>
  );
};

export default ApplicationAdminView;
