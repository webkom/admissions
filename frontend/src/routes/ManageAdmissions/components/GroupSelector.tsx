import React from "react";
import { MultiSelect } from "src/components/ui";
import { useManageGroups } from "src/query/hooks";
import { Group, GroupCategory } from "src/types";
import styled from "styled-components";

interface GroupSelectorProps {
  id: string;
  value: Group["pk"][];
  setGroups: (groupIds: Group["pk"][]) => void;
  addLabel?: string;
  emptyLabel?: string;
  selectedLabel?: string;
  invalid?: boolean;
}

const CATEGORY_ORDER: GroupCategory[] = ["committee", "revue", "other"];

const CATEGORY_LABELS: Record<GroupCategory, string> = {
  committee: "Komiteer",
  revue: "Revy",
  other: "Annet",
};

const GroupSelector: React.FC<GroupSelectorProps> = ({
  id,
  value: selectedGroups,
  setGroups,
  addLabel = "Legg til gruppe",
  emptyLabel = "Ingen grupper er valgt.",
  selectedLabel = "Valgte grupper",
  invalid = false,
}) => {
  const {
    data: groups,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useManageGroups();

  // Ordered here rather than server-side: MultiSelect draws a heading wherever
  // the group name changes, so the order options arrive in *is* the order the
  // sections appear in.
  const availableOptions = CATEGORY_ORDER.flatMap((category) =>
    (groups ?? [])
      .filter((group) => (group.category ?? "other") === category)
      .map((group) => ({
        value: group.pk,
        label: group.name,
        group: CATEGORY_LABELS[category],
      })),
  );
  const allGroupsSelected = groups
    ? groups.length > 0 && selectedGroups.length >= groups.length
    : false;
  const selectPlaceholder = isLoading
    ? "Laster grupper…"
    : availableOptions.length === 0
      ? "Ingen grupper å velge"
      : allGroupsSelected
        ? "Alle grupper er valgt"
        : addLabel;

  return (
    <Wrapper>
      <SelectWrapper>
        <MultiSelect
          id={id}
          values={selectedGroups}
          onChange={setGroups}
          options={availableOptions}
          placeholder={selectPlaceholder}
          getSelectionLabel={(selected) =>
            selected.length > 0 ? `${selected.length} valgt` : selectPlaceholder
          }
          selectAllLabel="Velg alle"
          clearAllLabel="Fjern alle"
          disabled={
            isLoading || Boolean(error) || availableOptions.length === 0
          }
          aria-label={addLabel}
          className={
            invalid ? "group-selector-multi-invalid" : "group-selector-multi"
          }
        />
      </SelectWrapper>

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
                  onClick={() =>
                    setGroups(selectedGroups.filter((id) => id !== group.pk))
                  }
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

const SelectWrapper = styled.div`
  width: min(100%, var(--form-control-width));

  .group-selector-multi > button {
    border-width: 2px;
    background: var(--color-surface-base);
  }

  .group-selector-multi-invalid > button {
    border-color: var(--color-danger-border);
    box-shadow: 0 0 0 3px var(--color-danger-soft);
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
