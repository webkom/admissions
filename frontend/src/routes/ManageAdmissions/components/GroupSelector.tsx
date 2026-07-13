import React from "react";
import { useManageGroups } from "src/query/hooks";
import { Group } from "src/types";
import styled from "styled-components";

interface GroupSelectorProps {
  id: string;
  value: Group["pk"][];
  toggleGroup: (groupId: string) => void;
  describedBy?: string;
  invalid?: boolean;
}

const GroupSelector: React.FC<GroupSelectorProps> = ({
  id,
  value: selectedGroups,
  toggleGroup,
  describedBy,
  invalid = false,
}) => {
  const { data: groups, isLoading, error } = useManageGroups();

  const toggleSelectedGroup = (groupId: string) => {
    const group = groups?.find((candidate) => candidate.pk === groupId);
    if (group) toggleGroup(group.pk);
  };

  return (
    <Wrapper>
      <Select
        id={id}
        value=""
        disabled={isLoading || Boolean(error)}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        onChange={(event) => toggleSelectedGroup(event.target.value)}
      >
        <option value="" disabled>
          {isLoading ? "Laster grupper…" : "Legg til gruppe"}
        </option>
        {groups
          ?.filter((group) => !selectedGroups.includes(group.pk))
          .map((groupSuggestion) => (
            <option key={groupSuggestion.pk} value={groupSuggestion.pk}>
              {groupSuggestion.name}
            </option>
          ))}
      </Select>

      {error && (
        <SelectorStatus role="alert">
          Gruppene kunne ikke lastes. Last siden på nytt og prøv igjen.
        </SelectorStatus>
      )}

      {selectedGroups.length === 0 ? (
        <SelectorStatus>Ingen grupper er valgt.</SelectorStatus>
      ) : (
        <SelectedGroupList aria-label="Valgte grupper">
          {selectedGroups.map((groupId) => {
            const group = groups?.find((candidate) => candidate.pk === groupId);
            if (!group) return null;

            return (
              <li key={group.pk}>
                <SelectedGroupButton
                  type="button"
                  onClick={() => toggleSelectedGroup(group.pk)}
                  aria-label={`Fjern ${group.name}`}
                >
                  {group.logo ? (
                    <GroupLogo src={group.logo} alt="" />
                  ) : (
                    <GroupFallback aria-hidden="true">
                      {group.name.slice(0, 1)}
                    </GroupFallback>
                  )}
                  <GroupName>{group.name}</GroupName>
                  <RemoveLabel aria-hidden="true">Fjern</RemoveLabel>
                </SelectedGroupButton>
              </li>
            );
          })}
        </SelectedGroupList>
      )}
    </Wrapper>
  );
};

export default GroupSelector;

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-md);
`;

const Select = styled.select`
  width: min(100%, var(--form-control-width));
  min-height: var(--control-height-md);
  padding: 0 var(--spacing-md);
  border: var(--border-width-default) solid var(--color-border-muted);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-base);
  color: var(--color-text-primary);
  font-size: var(--font-size-md);

  &[aria-invalid="true"] {
    border-color: var(--color-danger-border);
  }
`;

const SelectedGroupList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-md);
  margin: 0;
  padding: 0;
  list-style: none;
`;

const SelectedGroupButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-md);
  min-height: var(--control-height-md);
  padding: var(--spacing-sm) var(--spacing-md);
  border: var(--border-width-default) solid var(--color-border-muted);
  border-radius: var(--border-radius-pill);
  background: var(--color-surface-base);
  color: var(--color-text-primary);
  cursor: pointer;
  transition:
    border-color var(--easing-fast),
    background var(--easing-fast);

  &:hover {
    border-color: var(--color-brand);
    background: var(--color-brand-soft);
  }
`;

const GroupLogo = styled.img`
  width: var(--avatar-size-sm);
  height: var(--avatar-size-sm);
  object-fit: scale-down;
  border-radius: var(--border-radius-pill);
`;

const GroupFallback = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--avatar-size-sm);
  height: var(--avatar-size-sm);
  border-radius: var(--border-radius-pill);
  background: var(--color-surface-neutral);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-weight: 700;
`;

const GroupName = styled.span`
  font-size: var(--font-size-sm);
  font-weight: 600;
`;

const RemoveLabel = styled.span`
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
`;

const SelectorStatus = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
`;
