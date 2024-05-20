import React from "react";

import { Application } from "src/types";
import styled from "styled-components";
import {
  StatisticsGroupLogo,
  StatisticsName,
  StatisticsWrapper,
} from "./StyledElements";

interface GroupStatisticsProps {
  applications: Application[];
  groupName: string;
  groupLogo: string;
  selectedGroups: string[];
  setSelectedGroups: React.Dispatch<React.SetStateAction<string[]>>;
}

const GroupStatistics: React.FC<GroupStatisticsProps> = ({
  applications,
  groupName,
  groupLogo,
  selectedGroups,
  setSelectedGroups,
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

  const toggleSelectedGroup = () =>
    setSelectedGroups(
      selectedGroups.includes(groupName)
        ? selectedGroups.filter((selectedGroup) => selectedGroup !== groupName)
        : [...selectedGroups, groupName],
    );

  const count = calculateNumGroupApplications(groupName);
  return (
    <GroupStatisticsWrapper
      $smallerMargin
      selected={
        selectedGroups.includes(groupName) || selectedGroups.length === 0
      }
      onClick={toggleSelectedGroup}
    >
      <StatisticsGroupLogo src={groupLogo} />
      <StatisticsName $capitalize>{groupName}</StatisticsName>
      {count} stk
    </GroupStatisticsWrapper>
  );
};

export default GroupStatistics;

interface GroupStatisticsWrapperProps {
  selected: boolean;
}

const GroupStatisticsWrapper = styled(
  StatisticsWrapper,
)<GroupStatisticsWrapperProps>`
  margin: 0.25em;
  padding: 0.5em 0.5em;
  opacity: ${(props) => (props.selected ? 1 : 0.4)};
  transition: ease-in-out 0.15s opacity;
  border-radius: 2px;

  &:hover {
    background-color: var(--color-gray-2);
    cursor: pointer;
  }
`;
