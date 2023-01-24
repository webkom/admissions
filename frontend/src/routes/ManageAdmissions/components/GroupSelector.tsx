import React, { useState, useEffect } from "react";
import { Group } from "src/types";
import { callApiFromQuery } from "src/utils/callApi";
import styled from "styled-components";

interface GroupSelectorProps {
  value: Group[];
  toggleGroup: (group: Group) => void;
}

const GroupSelector: React.FC<GroupSelectorProps> = ({
  value: selectedGroups,
  toggleGroup,
}) => {
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    (async () => {
      const res = await callApiFromQuery("/group/");
      setGroups(res);
    })();
  }, []);

  const toggleSelectedGroup = (groupId: number) => {
    const group = groups.find((group) => group.pk === groupId);
    if (group) toggleGroup(group);
  };

  return (
    <>
      <Select
        placeholder="Skriv inn navnet på en gruppe"
        onChange={(e) => toggleSelectedGroup(Number(e.target.value))}
      >
        <option>Legg til gruppe</option>
        {groups
          .filter((group) => !selectedGroups.includes(group))
          .map((groupSuggestion) => (
            <option key={groupSuggestion.pk} value={groupSuggestion.pk}>
              {groupSuggestion.name}
            </option>
          ))}
      </Select>
      <SelectedGroupWrapper>
        {selectedGroups.map((group) => (
          <SelectedGroup
            key={"selected" + group.pk}
            onClick={() => toggleSelectedGroup(group.pk)}
            alt={group.name}
            title={group.name}
            src={group.logo}
          />
        ))}
      </SelectedGroupWrapper>
    </>
  );
};

export default GroupSelector;

const Select = styled.select`
  font-size: 16px;
  max-width: 100%;
  width: 300px;
  padding: 5px;
  border-radius: 3px;
  border: 1px solid #d6d6d6;
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
  border-radius: 25px;
  cursor: pointer;
  margin-right: 5px;
`;
