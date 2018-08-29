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
    <div>
      <CommitteeName>Søknad</CommitteeName>
      <Wrapper>
        <ReadMore lines={200}>{applicationText}</ReadMore>
      </Wrapper>
    </div>
  );
};

export default Application;
