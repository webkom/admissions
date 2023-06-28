import React from "react";

import ReadMore from "src/components/ReadMore";

import Wrapper from "./Wrapper";
import GroupName from "./GroupName";
import DeleteApplication from "./DeleteApplication";
import { JsonFieldInput } from "src/types";
import { filterEditableFields } from "src/utils/jsonFieldHelper";

interface ApplicationProps {
  questions: JsonFieldInput[];
  responses: Record<string, string>;
  applicationId: number;
}

const Application: React.FC<ApplicationProps> = ({
  questions,
  responses,
  applicationId,
}) => {
  return (
    <div>
      <GroupName>Søknad</GroupName>
      <Wrapper>
        <ReadMore
          truncateLength={400}
          text={filterEditableFields(questions)
            .map((question) => question.name + ":\n" + responses[question.id])
            .join("\n\n")}
        />
      </Wrapper>
      <DeleteApplication applicationId={applicationId} />
    </div>
  );
};

export default Application;
