import React from "react";

import ReadMore from "src/components/ReadMore";

import Wrapper from "./Wrapper";
import CommitteeName from "./CommitteeName";

const Application = ({ text }) => {
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
      <CommitteeName>Søknad </CommitteeName>
      <ReadMore lines={30}>{applicationText}</ReadMore>
    </Wrapper>
  );
};

export default Application;
