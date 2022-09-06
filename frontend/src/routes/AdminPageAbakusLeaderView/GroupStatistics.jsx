import React from "react";

import StatisticsName from "./StatisticsName";
import StatisticsWrapper from "./StatisticsWrapper";
import StatisticsGroupLogo from "./StatisticsGroupLogo";
import readmeIfy from "src/components/ReadmeLogo";

const GroupStatistics = ({ applications, groupName, groupLogo }) => {
  const calculateNumGroupApplications = (group) => {
    let sum = 0;
    applications.map((application) => {
      application.group_applications.map((groupApplication) => {
        if (groupApplication.group.name.toLowerCase() === group.toLowerCase()) {
          sum += 1;
        }
      });
    });
    return sum;
  };

  const count = calculateNumGroupApplications(groupName);
  return (
    <StatisticsWrapper smallerMargin>
      <StatisticsGroupLogo src={groupLogo} />
      <StatisticsName capitalize>{readmeIfy(groupName)}</StatisticsName>
      {count} stk
    </StatisticsWrapper>
  );
};

export default GroupStatistics;
