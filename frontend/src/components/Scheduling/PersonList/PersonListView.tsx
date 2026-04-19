import React from "react";
import styled from "styled-components";
import TimelineWrapper from "../TimelineWrapper";
import type { Candidate, Interviewer } from "../types";
import { DAYS_MAP } from "../utils/timeutils";
import AvailabilityBar from "../Availability/AvailabilityBar";
import { scheduleInset, scheduleLabel } from "../shared";

interface PersonListViewProps {
  data: Candidate[] | Interviewer[];
}

const PersonListView = ({ data }: PersonListViewProps) => {
  return (
    <List>
      {data.map((person) => {
        const isInterviewer = "availability" in person;
        const personName = person.name?.trim() || "Ukjent person";

        return (
          <Card key={person.id}>
            <CardMain>
              <Avatar $gender={person.gender}>{personName.charAt(0)}</Avatar>

              <Info>
                <HeaderRow>
                  <Name>{personName}</Name>
                  <GenderBadge $gender={person.gender}>
                    {person.gender}
                  </GenderBadge>
                </HeaderRow>
                <Id>#{person.id}</Id>
              </Info>
            </CardMain>

            {isInterviewer && (
              <AvailabilityTimelineWrapper>
                <TimelineTitle>Tilgjengelighet</TimelineTitle>
                <TimelineWrapper $gap="4px">
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
                </TimelineWrapper>
              </AvailabilityTimelineWrapper>
            )}
          </Card>
        );
      })}

      {data.length === 0 && (
        <EmptyState>
          <EmptyTitle>Ingen registrerte personer</EmptyTitle>
          <EmptyText>
            Listen blir fylt når kandidater eller intervjuere er tilgjengelige i
            denne visningen.
          </EmptyText>
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
  gap: 0.5rem;
`;

const Card = styled.li`
  padding: 0.875rem 1rem;
  border: 1px solid #e4e4e4;
  border-radius: 8px;
  background: #ffffff;
`;

const CardMain = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const Avatar = styled.div<{ $gender: string }>`
  width: 36px;
  height: 36px;
  background: ${(props) =>
    props.$gender === "F" ? "rgba(178, 18, 7, 0.07)" : "#f0f0f0"};
  color: ${(props) => (props.$gender === "F" ? "#b21207" : "#6b6b6b")};
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.875rem;
  flex-shrink: 0;
  border: 1px solid #e4e4e4;
`;

const Info = styled.div`
  flex: 1;
  min-width: 0;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const Name = styled.h3`
  font-size: 0.875rem;
  font-weight: 700;
  color: #111111;
  margin: 0;
`;

const Id = styled.span`
  ${scheduleLabel};
`;

const GenderBadge = styled.span<{ $gender: string }>`
  font-size: 0.688rem;
  font-weight: 700;
  padding: 0.15rem 0.4rem;
  border-radius: 999px;
  background: ${(props) =>
    props.$gender === "F" ? "rgba(178, 18, 7, 0.07)" : "#f0f0f0"};
  color: ${(props) => (props.$gender === "F" ? "#b21207" : "#6b6b6b")};
  border: 1px solid
    ${(props) =>
      props.$gender === "F" ? "rgba(178, 18, 7, 0.16)" : "#e4e4e4"};
`;

const AvailabilityTimelineWrapper = styled.div`
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #f0f0f0;
`;

const TimelineTitle = styled.div`
  ${scheduleLabel};
  margin-bottom: 0.4rem;
`;

const EmptyState = styled.div`
  ${scheduleInset};
  padding: 2rem 1rem;
  text-align: center;
`;

const EmptyTitle = styled.h4`
  margin: 0 0 0.3rem;
  color: #111111;
  font-size: 0.875rem;
  font-weight: 700;
`;

const EmptyText = styled.p`
  margin: 0;
  color: #a0a0a0;
  font-size: 0.813rem;
  line-height: 1.6;
`;
