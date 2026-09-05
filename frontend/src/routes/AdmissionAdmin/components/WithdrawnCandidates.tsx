import React, { useMemo, useState } from "react";
import { ChevronDown, UserX } from "lucide-react";
import styled from "styled-components";

import { useWithdrawalAudit } from "src/query/hooks";
import { iconSizes } from "src/styles/designTokens";
import type { WithdrawalAuditEvent } from "src/types";

const formatWhen = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

interface WithdrawnPerson {
  key: string;
  name: string;
  username: string;
  when: string;
  removed: boolean;
  groupNames: string[];
  groupIds: string[];
}

/**
 * One row per person, not per committee. The log records a separate event for
 * each committee a candidate had applied to, so somebody who withdrew from
 * three of them produces three events - which would list the same name three
 * times and treble a heading that counts "personer".
 */
const groupByPerson = (events: WithdrawalAuditEvent[]): WithdrawnPerson[] => {
  const people = new Map<string, WithdrawnPerson>();
  for (const event of events) {
    // Username is unique per user; fallback to full name or id if missing.
    const key =
      event.candidate_username || event.candidate_full_name || event.id;
    const seen = people.get(key);
    if (seen) {
      // Events arrive newest first, so the row already holds the latest
      // timestamp. Only the removal marker still needs widening: leaving one
      // committee but being removed from another is a removal worth flagging.
      seen.removed = seen.removed || !event.withdrawn_by_candidate;
      if (event.group_name && !seen.groupNames.includes(event.group_name)) {
        seen.groupNames.push(event.group_name);
      }
      if (event.group && !seen.groupIds.includes(event.group)) {
        seen.groupIds.push(event.group);
      }
      continue;
    }
    people.set(key, {
      key,
      name:
        event.candidate_full_name || event.candidate_username || "Ukjent søker",
      username: event.candidate_username || "",
      when: event.created_at,
      removed: !event.withdrawn_by_candidate,
      groupNames: event.group_name ? [event.group_name] : [],
      groupIds: event.group ? [event.group] : [],
    });
  }
  return [...people.values()];
};

interface Props {
  admissionSlug: string;
  /** Scoped recruiters only ever see their own committee's withdrawals;
   *  admins pass undefined to fetch the whole admission. */
  scopedGroupId?: string;
  /** Optional active group filters from the admin view. */
  selectedGroupIds?: string[];
  /** Optional search term from the admin view. */
  searchTerm?: string;
}

/**
 * Collapsible panel of everyone who withdrew or was removed, from the audit log.
 * Withdrawal is a hard delete - the candidate is gone from every schedule and
 * list - so this panel is the only place their exit is visible to recruiters.
 */
const WithdrawnCandidates: React.FC<Props> = ({
  admissionSlug,
  scopedGroupId,
  selectedGroupIds,
  searchTerm,
}) => {
  const [open, setOpen] = useState(false);
  const { data: events, isLoading } = useWithdrawalAudit(
    admissionSlug,
    scopedGroupId,
  );

  const people = useMemo(() => groupByPerson(events ?? []), [events]);

  const filteredPeople = useMemo(() => {
    let result = people;

    if (selectedGroupIds && selectedGroupIds.length > 0 && !scopedGroupId) {
      result = result.filter((person) =>
        person.groupIds.some((id) => selectedGroupIds.includes(id)),
      );
    }

    if (searchTerm && searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      result = result.filter(
        (person) =>
          person.name.toLowerCase().includes(q) ||
          person.username.toLowerCase().includes(q),
      );
    }

    return result;
  }, [people, selectedGroupIds, scopedGroupId, searchTerm]);

  if (isLoading || people.length === 0) return null;

  const countLabel =
    filteredPeople.length !== people.length
      ? `${filteredPeople.length} av ${people.length}`
      : `${people.length}`;

  return (
    <CardContainer>
      <HeaderButton
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <HeaderLeft>
          <IconBadge aria-hidden="true">
            <UserX size={iconSizes.control} />
          </IconBadge>
          <HeaderTitleGroup>
            <Title>Trukket seg eller fjernet</Title>
            <Subtitle>
              Oversikt over søkere som har trukket søknaden eller blitt fjernet
            </Subtitle>
          </HeaderTitleGroup>
          <CountPill>{countLabel}</CountPill>
        </HeaderLeft>
        <HeaderRight>
          <ActionLabel>{open ? "Skjul" : "Vis liste"}</ActionLabel>
          <ChevronDown
            size={iconSizes.control}
            aria-hidden="true"
            className={open ? "rotated" : undefined}
          />
        </HeaderRight>
      </HeaderButton>

      {open && (
        <ContentBody>
          {filteredPeople.length === 0 ? (
            <EmptyNotice>
              Ingen tilbaketrukne søkere samsvarer med det aktive filteret.
            </EmptyNotice>
          ) : (
            <List>
              {filteredPeople.map((person) => (
                <Row key={person.key}>
                  <CandidateInfo>
                    <NameRow>
                      <Name>{person.name}</Name>
                      {person.username && person.username !== person.name && (
                        <Username>@{person.username}</Username>
                      )}
                    </NameRow>
                    {person.groupNames.length > 0 && (
                      <GroupBadgeList>
                        {person.groupNames.map((groupName) => (
                          <GroupBadge key={groupName}>{groupName}</GroupBadge>
                        ))}
                      </GroupBadgeList>
                    )}
                  </CandidateInfo>
                  <StatusArea>
                    <StatusBadge $removed={person.removed}>
                      {person.removed ? "Fjernet av komité" : "Trukket selv"}
                    </StatusBadge>
                    <MetaDate title={person.when}>
                      {formatWhen(person.when)}
                    </MetaDate>
                  </StatusArea>
                </Row>
              ))}
            </List>
          )}
        </ContentBody>
      )}
    </CardContainer>
  );
};

export default WithdrawnCandidates;

const CardContainer = styled.section`
  margin-top: var(--spacing-xl);
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-lg);
  background: var(--color-surface-base);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
`;

const HeaderButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--spacing-md) var(--spacing-lg);
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: var(--color-surface-subtle);
  }

  svg.rotated {
    transform: rotate(180deg);
  }

  svg {
    transition: transform 0.2s ease;
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
`;

const IconBadge = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--border-radius-md);
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  flex-shrink: 0;
`;

const HeaderTitleGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
`;

const Title = styled.span`
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
`;

const Subtitle = styled.span`
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);

  @media (max-width: 640px) {
    display: none;
  }
`;

const CountPill = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.625rem;
  border-radius: var(--border-radius-pill);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  background: var(--color-surface-neutral);
  color: var(--color-text-secondary);
  border: var(--border-width-default) solid var(--color-border-soft);
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  color: var(--color-text-muted);
`;

const ActionLabel = styled.span`
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);

  @media (max-width: 640px) {
    display: none;
  }
`;

const ContentBody = styled.div`
  border-top: var(--border-width-default) solid var(--color-border-soft);
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-surface-base);
`;

const EmptyNotice = styled.p`
  margin: var(--spacing-sm) 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  font-style: italic;
`;

const List = styled.ul`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  margin: 0;
  padding: 0;
  list-style: none;
`;

const Row = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--border-radius-md);
  transition: background-color 0.12s ease;

  &:hover {
    background-color: var(--color-surface-subtle);
  }

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-xs);
  }
`;

const CandidateInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const NameRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
`;

const Name = styled.span`
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
`;

const Username = styled.span`
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
`;

const GroupBadgeList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
`;

const GroupBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.0625rem 0.5rem;
  border-radius: var(--border-radius-sm);
  font-size: var(--font-size-tiny);
  font-weight: var(--font-weight-medium);
  background: var(--color-surface-subtle);
  border: var(--border-width-default) solid var(--color-border-soft);
  color: var(--color-text-secondary);
`;

const StatusArea = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex-shrink: 0;

  @media (max-width: 640px) {
    width: 100%;
    justify-content: space-between;
  }
`;

const StatusBadge = styled.span<{ $removed: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: var(--border-radius-pill);
  font-size: var(--font-size-tiny);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: ${({ $removed }) =>
    $removed ? "var(--color-danger-bg)" : "var(--color-surface-neutral)"};
  color: ${({ $removed }) =>
    $removed ? "var(--color-danger-text)" : "var(--color-text-muted)"};
  border: var(--border-width-default) solid
    ${({ $removed }) =>
      $removed
        ? "var(--color-danger-border)"
        : "var(--color-border-subtle, var(--color-border-soft))"};
`;

const MetaDate = styled.span`
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  white-space: nowrap;
`;
