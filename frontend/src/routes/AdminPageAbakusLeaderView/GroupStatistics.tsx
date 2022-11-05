import React from "react";

import StatisticsName from "./StatisticsName";
import StatisticsWrapper from "./StatisticsWrapper";
import StatisticsGroupLogo from "./StatisticsGroupLogo";
import { Application } from "src/types";

interface GroupStatisticsProps {
  applications: Application[];
  groupName: string;
  groupLogo: string;
}

const GroupStatistics: React.FC<GroupStatisticsProps> = ({
  applications,
  groupName,
  groupLogo,
}) => {
  const calculateNumGroupApplications = (groupName: string) => {
    let sum = 0;
    applications.map((application) => {
      application.group_applications.map((groupApplication) => {
        if (
          groupApplication.group.name.toLowerCase() === groupName.toLowerCase()
        ) {
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
      <StatisticsName capitalize>{groupName}</StatisticsName>
      {count} stk
    </StatisticsWrapper>
  );
};

export default GroupStatistics;
