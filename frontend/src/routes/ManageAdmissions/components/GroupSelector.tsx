import React from "react";
import { useManageGroups } from "src/query/hooks";
import { Group } from "src/types";
import styled from "styled-components";

interface GroupSelectorProps {
  value: Group["pk"][];
  toggleGroup: (groupId: string) => void;
}

const GroupSelector: React.FC<GroupSelectorProps> = ({
  value: selectedGroups,
  toggleGroup,
}) => {
  const { data: groups } = useManageGroups();

  const toggleSelectedGroup = (groupId: string) => {
    const group = groups?.find((group) => group.pk === groupId);
    if (group) toggleGroup(group.pk);
  };

  return (
    <>
      <Select onChange={(e) => toggleSelectedGroup(e.target.value)}>
        <option>Legg til gruppe</option>
        {groups
          ?.filter((group) => !selectedGroups.includes(group.pk))
          .map((groupSuggestion) => (
            <option key={groupSuggestion.pk} value={groupSuggestion.pk}>
              {groupSuggestion.name}
            </option>
          ))}
      </Select>
      <SelectedGroupWrapper>
        {selectedGroups.map((groupId) => {
          const group = groups?.find((group) => group.pk === groupId);
          if (!group) return null;
          return (
            <SelectedGroup
              key={"selected" + group.pk}
              onClick={() => toggleSelectedGroup(group.pk)}
              alt={group.name}
              title={group.name}
              src={group.logo}
            />
          );
        })}
      </SelectedGroupWrapper>
    </>
  );
};

export default GroupSelector;

const Select = styled.select`
  font-size: var(--font-size-md);
  max-width: 100%;
  width: 300px;
  padding: 5px;
  border-radius: var(--border-radius-sm);
  border: 1px solid var(--color-border-muted);
`;

const SelectedGroupWrapper = styled.div`
  display: flex;
  flex-direction: row;
  margin-top: 10px;
`;

const SelectedGroup = styled.img`
  display: block;
  flex-basis: 50px;
  height: 50px;
  border-radius: 2rem;
  cursor: pointer;
  margin-right: 5px;
`;
