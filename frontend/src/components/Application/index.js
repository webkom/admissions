import React from "react";

import ReadMore from "src/components/ReadMore";

import Wrapper from "./Wrapper";
import CommitteeName from "./CommitteeName";
import DeleteApplication from "./DeleteApplication";

const Application = ({ text, applicationId }) => {
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
      <DeleteApplication id={applicationId} />
    </div>
  );
};

export default Application;
