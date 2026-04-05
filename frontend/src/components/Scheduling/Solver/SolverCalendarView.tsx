import React, { useMemo } from "react";
import styled from "styled-components";
import type { ScheduleItem } from "../../../types";
import { scheduleInset, scheduleLabel } from "../shared";

interface Props {
  schedule: ScheduleItem[];
}

const DAYS = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
];

const SolverCalendarView: React.FC<Props> = ({ schedule }) => {
  const startHour = 8;
  const endHour = 18;

  const HOURS = useMemo(
    () =>
      Array.from(
        { length: endHour - startHour },
        (_, i) => `${i + startHour}:00`,
      ),
    [startHour, endHour],
  );

  const scheduleMap = useMemo(() => {
    const map = new Map<string, ScheduleItem>();
    schedule.forEach((item) => {
      const dayIndex = Math.floor(item.time / 24);
      const hour = item.time % 24;
      map.set(`${dayIndex}-${hour}`, item);
    });
    return map;
  }, [schedule]);

  return (
    <Wrapper>
      <Grid>
        <div />
        {DAYS.map((day) => (
          <HeaderCell key={day}>{day}</HeaderCell>
        ))}

        {HOURS.map((hourLabel) => {
          const hour = parseInt(hourLabel, 10);
          return (
            <React.Fragment key={hourLabel}>
              <TimeLabel>{hourLabel}</TimeLabel>
              {DAYS.map((_, dayIndex) => {
                const item = scheduleMap.get(`${dayIndex}-${hour}`);
                return (
                  <Slot key={`${dayIndex}-${hour}`} $hasInterview={!!item}>
                    {item && (
                      <InterviewCard>
                        <CandidateName>{item.candidate}</CandidateName>
                        <PanelList>
                          {item.panel.map((p, i) => (
                            <PanelMember key={i}>{p}</PanelMember>
                          ))}
                        </PanelList>
                      </InterviewCard>
                    )}
                  </Slot>
                );
              })}
            </React.Fragment>
          );
        })}
      </Grid>
    </Wrapper>
  );
};

export default SolverCalendarView;

const Wrapper = styled.div`
  ${scheduleInset};
  overflow-x: auto;
  padding: 0.85rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 68px repeat(7, minmax(150px, 1fr));
  gap: 8px;
  min-width: 1100px;
`;

const HeaderCell = styled.div`
  ${scheduleLabel};
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 3rem;
  border-radius: 0.95rem;
  background: rgba(255, 255, 255, 0.72);
  color: #6e6256;
`;

const TimeLabel = styled.div`
  ${scheduleLabel};
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 0.6rem;
  color: #8a7b6b;
`;

const Slot = styled.div<{ $hasInterview: boolean }>`
  min-height: 4.9rem;
  border-radius: 0.95rem;
  padding: 0.3rem;
  background-color: ${(props) =>
    props.$hasInterview
      ? "rgba(255, 255, 255, 0.86)"
      : "rgba(247, 241, 232, 0.8)"};
  border: 1px solid #e3d8ca;
`;

const InterviewCard = styled.div`
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(138, 31, 22, 0.14);
  border-left: 3px solid #8a1f16;
  padding: 0.6rem;
  border-radius: 0.75rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  box-shadow: 0 12px 18px -20px rgba(51, 37, 24, 0.45);
`;

const CandidateName = styled.div`
  font-size: 0.82rem;
  font-weight: 700;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const PanelList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
`;

const PanelMember = styled.span`
  font-size: 0.7rem;
  color: #4b5563;
  background: rgba(17, 24, 39, 0.06);
  padding: 0.2rem 0.45rem;
  border-radius: 999px;
  white-space: nowrap;
`;
