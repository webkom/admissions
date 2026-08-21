import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { useFormikContext } from "formik";
import styled from "styled-components";

import { FieldLabel, StyledTextAreaField } from "src/components/styledFields";
import { Group } from "src/types";
import { savePriorityTextDraft } from "src/utils/draftHelper";
import useDebouncedState from "src/utils/useDebouncedState";
import { FormValues, SelectedGroups } from ".";
import { parsePriorityText, serializePriorityText } from "./priorityText";

interface PriorityTextFieldProps {
  groups: Group[];
  selectedGroups: SelectedGroups;
}

const PriorityTextField: React.FC<PriorityTextFieldProps> = ({
  groups,
  selectedGroups,
}) => {
  const { values, setFieldValue, handleBlur } = useFormikContext<FormValues>();
  const selectedGroupList = useMemo(
    () =>
      groups.filter(
        (group) => selectedGroups[group.name.toLowerCase()] ?? false,
      ),
    [groups, selectedGroups],
  );
  const selectedGroupNames = useMemo(
    () => selectedGroupList.map((group) => group.name),
    [selectedGroupList],
  );
  const parsedPriority = useMemo(
    () => parsePriorityText(values.priorityText, selectedGroupNames),
    [selectedGroupNames, values.priorityText],
  );

  const [rankedGroups, setRankedGroups] = useState<string[]>(
    () => parsedPriority.rankedGroups,
  );
  const [comments, setComments] = useState(() => parsedPriority.comments);
  const [hasExplicitRanking, setHasExplicitRanking] = useState(
    () => parsedPriority.hasExplicitRanking,
  );
  const [draggedGroupName, setDraggedGroupName] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const debouncedValue = useDebouncedState(values.priorityText);

  useEffect(() => {
    savePriorityTextDraft(debouncedValue);
  }, [debouncedValue]);

  useEffect(() => {
    setRankedGroups((current) =>
      current.length === parsedPriority.rankedGroups.length &&
      current.every(
        (groupName, index) => parsedPriority.rankedGroups[index] === groupName,
      )
        ? current
        : parsedPriority.rankedGroups,
    );
    setComments((current) =>
      current === parsedPriority.comments ? current : parsedPriority.comments,
    );
    setHasExplicitRanking((current) =>
      current === parsedPriority.hasExplicitRanking
        ? current
        : parsedPriority.hasExplicitRanking,
    );
  }, [parsedPriority]);

  const commitPriorityText = (
    nextRankedGroups: string[],
    nextComments: string,
    nextHasExplicitRanking = hasExplicitRanking,
  ) => {
    setRankedGroups(nextRankedGroups);
    setComments(nextComments);
    setHasExplicitRanking(nextHasExplicitRanking);
    void setFieldValue(
      "priorityText",
      serializePriorityText(
        nextRankedGroups,
        nextComments,
        nextHasExplicitRanking,
      ),
      false,
    );
  };

  const moveGroup = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= rankedGroups.length) return;
    const next = [...rankedGroups];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    commitPriorityText(next, comments, true);
  };

  const clearDragState = () => {
    setDraggedGroupName(null);
    setDropTargetIndex(null);
  };

  const handleDragStart = (
    event: React.DragEvent<HTMLButtonElement>,
    groupName: string,
  ) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", groupName);
    setDraggedGroupName(groupName);
    setDropTargetIndex(null);
  };

  const handleDrop = (targetIndex: number) => {
    if (!draggedGroupName) return;
    const sourceIndex = rankedGroups.indexOf(draggedGroupName);
    if (sourceIndex === -1 || sourceIndex === targetIndex) {
      clearDragState();
      return;
    }
    moveGroup(sourceIndex, targetIndex);
    clearDragState();
  };

  return (
    <Wrapper>
      <SectionCard>
        <LabelRow>
          <FieldLabel>Prioritering</FieldLabel>
          <Optional>(valgfritt)</Optional>
        </LabelRow>
        <SectionHelp>
          Ranger komiteene du har valgt. Bare du og opptakets leder og nestleder
          kan se dette.
        </SectionHelp>
        {rankedGroups.length > 1 ? (
          <RankingList data-cy="priority-ranking-list">
            {rankedGroups.map((groupName, index) => (
              <RankingItem
                key={groupName}
                $isDropTarget={
                  draggedGroupName !== null &&
                  draggedGroupName !== groupName &&
                  dropTargetIndex === index
                }
                onDragOver={(event) => {
                  if (!draggedGroupName || draggedGroupName === groupName)
                    return;
                  event.preventDefault();
                  if (dropTargetIndex !== index) {
                    setDropTargetIndex(index);
                  }
                }}
                onDragLeave={(event) => {
                  if (
                    event.currentTarget.contains(
                      event.relatedTarget as Node | null,
                    )
                  ) {
                    return;
                  }
                  if (dropTargetIndex === index) {
                    setDropTargetIndex(null);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  handleDrop(index);
                }}
              >
                <RankingNumber>{index + 1}</RankingNumber>
                <RankingName>
                  <DragHandle
                    type="button"
                    draggable
                    onDragStart={(event) => handleDragStart(event, groupName)}
                    onDragEnd={clearDragState}
                    aria-label={`Dra for å flytte ${groupName}`}
                    title={`Dra for å endre plasseringen til ${groupName}`}
                  >
                    <GripVertical aria-hidden="true" size={16} />
                  </DragHandle>
                  <span>{groupName}</span>
                </RankingName>
                <RankingActions>
                  <MoveButton
                    type="button"
                    onClick={() => moveGroup(index, index - 1)}
                    disabled={index === 0}
                    aria-label={`Flytt ${groupName} opp`}
                  >
                    <ChevronUp aria-hidden="true" size={16} />
                  </MoveButton>
                  <MoveButton
                    type="button"
                    onClick={() => moveGroup(index, index + 1)}
                    disabled={index === rankedGroups.length - 1}
                    aria-label={`Flytt ${groupName} ned`}
                  >
                    <ChevronDown aria-hidden="true" size={16} />
                  </MoveButton>
                </RankingActions>
              </RankingItem>
            ))}
          </RankingList>
        ) : (
          <EmptyState>
            Velg minst to komiteer for å sette rekkefølge.
          </EmptyState>
        )}
      </SectionCard>

      <CommentsSection>
        <LabelRow>
          <FieldLabel htmlFor="priorityText-comments">
            Andre kommentarer relatert til opptaket generelt
          </FieldLabel>
          <Optional>(valgfritt)</Optional>
        </LabelRow>
        <StyledTextAreaField
          id="priorityText-comments"
          name="priorityText-comments"
          value={comments}
          onChange={(event) =>
            commitPriorityText(
              rankedGroups,
              event.target.value,
              hasExplicitRanking,
            )
          }
          onBlur={handleBlur}
          placeholder="Alt annet du vil si til leder/nestleder."
          minRows={4}
        />
      </CommentsSection>
    </Wrapper>
  );
};

export default PriorityTextField;

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  width: 100%;
`;

const SectionCard = styled.div`
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-lg);
  background: var(--color-surface-default);
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
`;

const CommentsSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
`;

const LabelRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
`;

const Optional = styled.span`
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
`;

const SectionHelp = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-copy);
`;

const RankingList = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
`;

const RankingItem = styled.li<{ $isDropTarget: boolean }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--spacing-md);
  align-items: center;
  padding: var(--spacing-md);
  border-radius: var(--border-radius-md);
  border: var(--border-width-default) solid
    ${({ $isDropTarget }) =>
      $isDropTarget ? "var(--color-brand)" : "var(--color-border-soft)"};
  background: var(--color-surface-subtle);
  box-shadow: ${({ $isDropTarget }) =>
    $isDropTarget ? "0 0 0 1px var(--color-brand-ring)" : "none"};
`;

const RankingNumber = styled.span`
  min-width: 2rem;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-muted);
`;

const RankingName = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
  color: var(--color-text-primary);
  font-weight: var(--font-weight-semibold);

  svg {
    color: var(--color-text-subtle);
    flex-shrink: 0;
  }

  span {
    overflow-wrap: anywhere;
  }
`;

const DragHandle = styled.button`
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: var(--border-radius-sm);
  border: var(--border-width-default) solid var(--color-border-soft);
  background: var(--color-surface-default);
  color: var(--color-text-subtle);
  cursor: grab;

  &:active {
    cursor: grabbing;
  }

  &:focus-visible {
    outline: 2px solid var(--color-brand-ring);
    outline-offset: 2px;
  }
`;

const RankingActions = styled.div`
  display: flex;
  gap: var(--spacing-xs);
`;

const MoveButton = styled.button`
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--border-radius-sm);
  border: var(--border-width-default) solid var(--color-border-soft);
  background: var(--color-surface-default);
  color: var(--color-text-primary);
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    color: var(--color-text-disabled);
    background: var(--color-surface-subtle);
  }
`;

const EmptyState = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
`;
