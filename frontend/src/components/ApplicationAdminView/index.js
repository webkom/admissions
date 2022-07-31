import React from "react";

import ReadMore from "src/components/ReadMore";

import Wrapper from "./Wrapper";
import CommitteeName from "./CommitteeName";
import CommitteeLogo from "./CommitteeLogo";
import SmallDescription from "./SmallDescription";
import SmallDescriptionWrapper from "./SmallDescriptionWrapper";

import DeleteApplication from "src/components/Application/DeleteApplication";

const ApplicationAdminView = ({ committee, text, applicationId }) => {
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
      <CommitteeLogo src={committee.logo} />
      <SmallDescriptionWrapper>
        <SmallDescription>Søknad til ...</SmallDescription>
        <CommitteeName>{committee} </CommitteeName>
        <DeleteApplication id={applicationId} committee={committee} />
      </SmallDescriptionWrapper>

      <ReadMore lines={3}>{applicationText}</ReadMore>
    </Wrapper>
  );
};

export default ApplicationAdminView;
