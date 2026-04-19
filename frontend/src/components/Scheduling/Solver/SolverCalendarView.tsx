import React, { useMemo } from "react";
import styled from "styled-components";
import type { ScheduleItem } from "../../../types";
import {
  scheduleGridHeaderCell,
  scheduleGridShell,
  scheduleGridTimeLabel,
} from "../shared";
import { formatDateHeader } from "../scheduleUtils";

interface Props {
  schedule: ScheduleItem[];
  dates: string[];
}

const SolverCalendarView: React.FC<Props> = ({ schedule, dates }) => {
  const startHour = 8;
  const endHour = 18;

  const HOURS = useMemo(
    () =>
      Array.from(
        { length: endHour - startHour },
        (_, i) => `${i + startHour}:00`,
      ),
    [],
  );

  const scheduleMap = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    schedule.forEach((item) => {
      const dayIndex = Math.floor(item.time / 24);
      const hour = item.time % 24;
      const key = `${dayIndex}-${hour}`;
      const existing = map.get(key) ?? [];
      existing.push(item);
      map.set(key, existing);
    });
    return map;
  }, [schedule]);

  return (
    <Wrapper>
      <Grid $columns={dates.length + 1}>
        <div />
        {dates.map((date, dayIndex) => {
          const { weekday, dayMonth } = formatDateHeader(date);
          return (
            <HeaderCell key={date}>
              <span>{weekday}</span>
              <DateSub>{dayMonth}</DateSub>
            </HeaderCell>
          );
        })}

        {HOURS.map((hourLabel) => {
          const hour = parseInt(hourLabel, 10);
          return (
            <React.Fragment key={hourLabel}>
              <TimeLabel>{hourLabel}</TimeLabel>
              {dates.map((_, dayIndex) => {
                const items = scheduleMap.get(`${dayIndex}-${hour}`) ?? [];
                return (
                  <Slot key={`${dayIndex}-${hour}`} $hasInterview={items.length > 0}>
                    {items.map((item, index) => (
                      <InterviewCard key={`${item.candidate}-${index}`}>
                        <CandidateName>{item.candidate}</CandidateName>
                        <PanelList>
                          {item.panel.map((p, i) => (
                            <PanelMember
                              key={i}
                              $isOvertime={p.is_overtime}
                              title={
                                p.is_overtime
                                  ? "Utenfor registrert tilgjengelighet"
                                  : undefined
                              }
                            >
                              {p.name}
                            </PanelMember>
                          ))}
                        </PanelList>
                      </InterviewCard>
                    ))}
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
  ${scheduleGridShell};
  min-width: 0;
  width: 100%;
`;

const Grid = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: 56px repeat(${(props) => props.$columns - 1}, minmax(110px, 1fr));
  gap: 6px;
  min-width: max(680px, ${(props) => (props.$columns - 1) * 110 + 56}px);
`;

const DateSub = styled.span`
  font-size: 0.688rem;
  font-weight: 600;
  color: #a0a0a0;
  display: block;
`;

const HeaderCell = styled.div`
  ${scheduleGridHeaderCell};
`;

const TimeLabel = styled.div`
  ${scheduleGridTimeLabel};
`;

const Slot = styled.div<{ $hasInterview: boolean }>`
  min-height: 4.5rem;
  border-radius: 6px;
  padding: 4px;
  background: ${(props) => (props.$hasInterview ? "#ffffff" : "#f5f5f5")};
  border: 1px solid ${(props) => (props.$hasInterview ? "#e4e4e4" : "#ebebeb")};
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InterviewCard = styled.div`
  background: #ffffff;
  border: 1px solid #e4e4e4;
  border-left: 2px solid var(--lego-red-color);
  padding: 0.5rem 0.6rem;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`;

const CandidateName = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
  color: #111111;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const PanelList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
`;

const PanelMember = styled.span<{ $isOvertime: boolean }>`
  font-size: 0.688rem;
  color: ${(props) => (props.$isOvertime ? "#b21207" : "#6b6b6b")};
  background: ${(props) =>
    props.$isOvertime ? "rgba(178, 18, 7, 0.08)" : "#f0f0f0"};
  border: 1px solid
    ${(props) =>
      props.$isOvertime ? "rgba(178, 18, 7, 0.2)" : "transparent"};
  padding: 0.15rem 0.4rem;
  border-radius: 999px;
  white-space: nowrap;
`;
