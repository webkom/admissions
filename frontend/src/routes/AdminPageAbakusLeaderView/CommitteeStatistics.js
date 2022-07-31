import React from "react";

import StatisticsName from "./StatisticsName";
import StatisticsWrapper from "./StatisticsWrapper";
import StatisticsCommitteeLogo from "./StatisticsCommitteeLogo";

const CommitteeStatistics = ({
  applications,
  committeeName,
  committeeLogo,
}) => {
  const calculateNumCommitteeApplications = (committee) => {
    var sum = 0;
    applications.map((application) => {
      application.committee_applications.map((committeeApplication) => {
        if (
          committeeApplication.committee.name.toLowerCase() ===
          committee.toLowerCase()
        ) {
          sum += 1;
        }
      });
    });
    return sum;
  };

  const count = calculateNumCommitteeApplications(committeeName);
  return (
    <StatisticsWrapper smallerMargin>
      <StatisticsCommitteeLogo src={committeeLogo} />
      <StatisticsName capitalize>{committeeName}</StatisticsName>
      {count} stk
    </StatisticsWrapper>
  );
};

export default CommitteeStatistics;
