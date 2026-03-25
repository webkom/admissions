import React from "react";
import styled from "styled-components";
import type { Candidate, Interviewer } from "../types";
import { DAYS_MAP } from "../utils/timeutils";
import AvailabilityBar from "../Availability/AvailabilityBar";

interface PersonListViewProps {
  data: Candidate[] | Interviewer[];
}

const PersonListView = ({ data }: PersonListViewProps) => {
  return (
    <List>
      {data.map((person) => {
        const isInterviewer = "availability" in person;

        return (
          <Card key={person.id}>
            <CardMain>
              <Avatar $gender={person.gender}>{person.name.charAt(0)}</Avatar>

              <Info>
                <HeaderRow>
                  <Name>{person.name}</Name>
                  <GenderBadge $gender={person.gender}>
                    {person.gender}
                  </GenderBadge>
                </HeaderRow>
                <Id>#{person.id}</Id>
              </Info>

              <ActionArea>{/* Action buttons could go here */}</ActionArea>
            </CardMain>

            {isInterviewer && (
              <AvailabilityTimelineWrapper>
                <TimelineTitle>Tilgjengelighet:</TimelineTitle>
                <TimelineBars>
                  {DAYS_MAP.map((dayLabel, dayIndex) => {
                    const hasAvailability = (
                      person as Interviewer
                    ).availability.some(
                      (slot) => Math.floor(slot / 24) === dayIndex,
                    );
                    return (
                      <AvailabilityBar
                        key={dayIndex}
                        dayLabel={dayLabel}
                        dayIndex={dayIndex}
                        allSlots={(person as Interviewer).availability}
                        isActive={hasAvailability}
                      />
                    );
                  })}
                </TimelineBars>
              </AvailabilityTimelineWrapper>
            )}
          </Card>
        );
      })}

      {data.length === 0 && (
        <EmptyState>
          <EmptyIcon>🔍</EmptyIcon>
          <EmptyText>Ingen funnet</EmptyText>
        </EmptyState>
      )}
    </List>
  );
};

export default PersonListView;

const List = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const Card = styled.li`
  background: var(--lego-card-color);
  border: 1px solid var(--border-gray);
  border-radius: 1rem;
  padding: 1rem;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);

  &:hover {
    border-color: var(--color-gray-4);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    transform: translateY(-1px);
  }
`;

const CardMain = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const Avatar = styled.div<{ $gender: string }>`
  width: 44px;
  height: 44px;
  background: ${(props) =>
    props.$gender === "F" ? "var(--color-red-1)" : "var(--color-blue-1)"};
  color: ${(props) =>
    props.$gender === "F" ? "var(--color-red-7)" : "var(--color-blue-7)"};
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.25rem;
  flex-shrink: 0;
  border: 2px solid var(--lego-card-color);
  box-shadow: 0 0 0 1px var(--border-gray);
`;

const Info = styled.div`
  flex: 1;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const Name = styled.h3`
  font-size: 1rem;
  font-weight: 700;
  color: var(--lego-font-color);
  margin: 0;
`;

const Id = styled.span`
  font-size: 0.75rem;
  color: var(--color-gray-5);
  font-family: var(--font-family-mono, monospace);
`;

const GenderBadge = styled.span<{ $gender: string }>`
  font-size: 0.625rem;
  font-weight: 800;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: ${(props) =>
    props.$gender === "F" ? "var(--color-red-1)" : "var(--color-blue-1)"};
  color: ${(props) =>
    props.$gender === "F" ? "var(--color-red-6)" : "var(--color-blue-6)"};
  border: 1px solid
    ${(props) =>
      props.$gender === "F" ? "var(--color-red-2)" : "var(--color-blue-2)"};
`;

const ActionArea = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const AvailabilityTimelineWrapper = styled.div`
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-gray);
`;

const TimelineTitle = styled.div`
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--color-gray-5);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
`;

const TimelineBars = styled.div`
  display: flex;
  gap: 3px;
`;

const EmptyState = styled.div`
  padding: 3rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--border-gray);
  border-radius: 1rem;
  background: var(--color-gray-1);
`;

const EmptyIcon = styled.div`
  font-size: 2rem;
  margin-bottom: 0.5rem;
  opacity: 0.5;
`;

const EmptyText = styled.p`
  font-size: 0.875rem;
  color: var(--color-gray-5);
  font-weight: 500;
`;
