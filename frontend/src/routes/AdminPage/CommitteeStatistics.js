import React from "react";

import StatisticsName from "./StatisticsName";
import StatisticsWrapper from "./StatisticsWrapper";
import StatisticsCommitteeLogo from "./StatisticsCommitteeLogo";

const CommitteeStatistics = ({ applications, committee }) => {
  const calculateNumCommitteeApplications = committee => {
    var sum = 0;
    applications.map(application => {
      application.committee_applications.map(committeeApplication => {
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

  const count = calculateNumCommitteeApplications(committee);

  return (
    <StatisticsWrapper smallerMargin>
      <StatisticsCommitteeLogo
        src={require(`assets/committee_logos/${committee.toLowerCase()}.png`)}
      />
      <StatisticsName capitalize>{committee}</StatisticsName>
      {count} stk
    </StatisticsWrapper>
  );
};

export default CommitteeStatistics;
