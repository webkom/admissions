import React from "react";

import { Application } from "src/types";
import {
  GroupFilterButton,
  GroupFilterCount,
  GroupFilterLogo,
  GroupFilterMeta,
  GroupFilterName,
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
    applications.forEach((application) => {
      application.group_applications.forEach((groupApplication) => {
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
  const isSelected =
    selectedGroups.includes(groupName) || selectedGroups.length === 0;

  return (
    <GroupFilterButton
      type="button"
      $selected={isSelected}
      onClick={toggleSelectedGroup}
    >
      <GroupFilterMeta>
        <GroupFilterLogo src={groupLogo} alt="" />
        <GroupFilterName>{groupName}</GroupFilterName>
      </GroupFilterMeta>
      <GroupFilterCount>{count}</GroupFilterCount>
    </GroupFilterButton>
  );
};

export default GroupStatistics;
