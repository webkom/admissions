import React from "react";

import ReadMore from "src/components/ReadMore";

import Wrapper from "./Wrapper";
import GroupName from "./GroupName";
import DeleteApplication from "./DeleteApplication";

interface ApplicationProps {
  text: string;
  applicationId: number;
}

const Application: React.FC<ApplicationProps> = ({ text, applicationId }) => {
  return (
    <div>
      <GroupName>Søknad</GroupName>
      <Wrapper>
        <ReadMore truncateLength={400} text={text} />
      </Wrapper>
      <DeleteApplication applicationId={applicationId} />
    </div>
  );
};

export default Application;
