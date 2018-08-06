import React, { Component } from "react";

import { CardTitle, CardParagraph } from "src/components/Card";
import ReadMore from "src/components/ReadMore";

import Wrapper from "./Wrapper";
import CommitteeName from "./CommitteeName";
import CommitteeLogo from "./CommitteeLogo";
import SmallDescription from "./SmallDescription";
import SmallDescriptionWrapper from "./SmallDescriptionWrapper";

const Application = ({ committee, text, onChange }) => {
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

export default Application;
