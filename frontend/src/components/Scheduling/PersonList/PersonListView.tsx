import React from "react";
import styled from "styled-components";
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
  gap: 0.75rem;
`;

const Card = styled.li`
  ${scheduleInset};
  padding: 1rem;
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
    props.$gender === "F"
      ? "rgba(178, 18, 7, 0.08)"
      : "rgba(31, 122, 92, 0.08)"};
  color: ${(props) => (props.$gender === "F" ? "#8a1f16" : "#166534")};
  border-radius: 0.95rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 1.05rem;
  flex-shrink: 0;
  border: 1px solid #ddd2c3;
`;

const Info = styled.div`
  flex: 1;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const Name = styled.h3`
  font-size: 1rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
`;

const Id = styled.span`
  ${scheduleLabel};
  color: #8a7b6b;
`;

const GenderBadge = styled.span<{ $gender: string }>`
  font-size: 0.68rem;
  font-weight: 800;
  padding: 0.22rem 0.45rem;
  border-radius: 999px;
  background: ${(props) =>
    props.$gender === "F"
      ? "rgba(178, 18, 7, 0.08)"
      : "rgba(31, 122, 92, 0.08)"};
  color: ${(props) => (props.$gender === "F" ? "#8a1f16" : "#166534")};
  border: 1px solid
    ${(props) =>
      props.$gender === "F"
        ? "rgba(178, 18, 7, 0.14)"
        : "rgba(31, 122, 92, 0.14)"};
`;

const AvailabilityTimelineWrapper = styled.div`
  margin-top: 0.95rem;
  padding-top: 0.95rem;
  border-top: 1px solid #e3d8ca;
`;

const TimelineTitle = styled.div`
  ${scheduleLabel};
  margin-bottom: 0.5rem;
`;

const TimelineBars = styled.div`
  display: flex;
  gap: 4px;
`;

const EmptyState = styled.div`
  ${scheduleInset};
  padding: 2rem 1rem;
  text-align: center;
`;

const EmptyTitle = styled.h4`
  margin: 0 0 0.4rem;
  color: #111827;
  font-size: 1rem;
`;

const EmptyText = styled.p`
  margin: 0;
  color: #6b7280;
  line-height: 1.6;
`;
