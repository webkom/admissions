import React from "react";

import ReadMore from "src/components/ReadMore";
import {
  Wrapper,
  CommitteeName,
  CommitteeLogo,
  SmallDescription,
  SmallDescriptionWrapper
} from "./styles";

const ApplicationAdminView = ({ committee, text }) => {
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
      <CommitteeLogo
        src={require(`assets/committee_logos/${committee.toLowerCase()}.png`)}
      />
      <SmallDescriptionWrapper>
        <SmallDescription>Søknad til ...</SmallDescription>
        <CommitteeName>{committee} </CommitteeName>
      </SmallDescriptionWrapper>

      <ReadMore lines={3}>{applicationText}</ReadMore>
    </Wrapper>
  );
};

export default ApplicationAdminView;
