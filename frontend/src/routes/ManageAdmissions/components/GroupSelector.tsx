import React from "react";
import { useManageGroups } from "src/query/hooks";
import { Group } from "src/types";
import styled from "styled-components";

interface GroupSelectorProps {
  id: string;
  value: Group["pk"][];
  toggleGroup: (groupId: string) => void;
  addLabel?: string;
  emptyLabel?: string;
  selectedLabel?: string;
  describedBy?: string;
  invalid?: boolean;
  admissionField?: "admin_groups" | "groups";
}

const GroupSelector: React.FC<GroupSelectorProps> = ({
  id,
  value: selectedGroups,
  toggleGroup,
  addLabel = "Legg til gruppe",
  emptyLabel = "Ingen grupper er valgt.",
  selectedLabel = "Valgte grupper",
  describedBy,
  invalid = false,
  admissionField,
}) => {
  const {
    data: groups,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useManageGroups();

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
        data-admission-field={admissionField}
        onChange={(event) => toggleSelectedGroup(event.target.value)}
      >
        <option value="" disabled>
          {isLoading ? "Laster grupper…" : addLabel}
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
        <SelectorError role="alert">
          <span>Gruppene kunne ikke lastes.</span>
          <RetryButton
            type="button"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? "Prøver igjen…" : "Prøv igjen"}
          </RetryButton>
        </SelectorError>
      )}

      {selectedGroups.length === 0 ? (
        <SelectorStatus>{emptyLabel}</SelectorStatus>
      ) : (
        <SelectedGroupList aria-label={selectedLabel}>
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
  font-weight: var(--font-weight-bold);
`;

const GroupName = styled.span`
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
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

const SelectorError = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-md);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
`;

const RetryButton = styled.button`
  min-height: var(--control-height-sm);
  padding: 0 var(--spacing-md);
  border: var(--border-width-default) solid var(--color-danger-border);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-base);
  color: var(--color-danger);
  font: inherit;
  font-weight: var(--font-weight-semibold);
  cursor: pointer;

  &:disabled {
    opacity: var(--opacity-muted);
    cursor: wait;
  }
`;
