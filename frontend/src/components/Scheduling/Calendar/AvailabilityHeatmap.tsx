import React, { useState, useMemo } from "react";
import styled, { css } from "styled-components";
import {
  scheduleGridHeaderCell,
  scheduleGridShell,
  scheduleGridTimeLabel,
  scheduleInset,
  scheduleInput,
  scheduleLabel,
  scheduleSurface,
} from "../shared";
import type { Interviewer } from "../types";
import { formatDateHeader, makeSlotKey, parseSlotKey } from "../scheduleUtils";

interface AvailabilityHeatmapProps {
  interviewers: Interviewer[];
  availableSlots: Set<string>;
  dates: string[];
  startHour?: number;
  endHour?: number;
  sessionDuration: number;
}

type FilterMode = "all" | "male" | "female" | "people";

const AvailabilityHeatmap: React.FC<AvailabilityHeatmapProps> = ({
  interviewers,
  availableSlots,
  dates,
  startHour = 8,
  endHour = 18,
  sessionDuration,
}) => {
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedIndividual, setSelectedIndividual] = useState<string | null>(
    null,
  );

  const startMinute = startHour * 60;
  const endMinute = endHour * 60;

  const TIME_SLOTS = useMemo(() => {
    const slots = [];
    const step = sessionDuration > 0 ? sessionDuration : 60;
    for (let m = startMinute; m < endMinute; m += step) {
      slots.push(m);
    }
    return slots;
  }, [startMinute, endMinute, sessionDuration]);

  const formatTime = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, "0")}`;
  };

  const filteredInterviewers = useMemo(() => {
    switch (filterMode) {
      case "male":
        return interviewers.filter((i) => i.gender === "M");
      case "female":
        return interviewers.filter((i) => i.gender === "F");
      case "people":
        return selectedIndividual
          ? interviewers.filter((i) => i.id === selectedIndividual)
          : interviewers;
      default:
        return interviewers;
    }
  }, [interviewers, filterMode, selectedIndividual]);

  const slotAvailability = useMemo(() => {
    const counts = new Map<string, number>();

    filteredInterviewers.forEach((interviewer) => {
      interviewer.availability.forEach((slot) => {
        const dayIndex = Math.floor(slot / 24);
        const hour = slot % 24;
        const date = dates[dayIndex];
        if (!date) return;
        const key = makeSlotKey(date, hour * 60);
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });

    return counts;
  }, [filteredInterviewers, dates]);

  const maxCount = useMemo(
    () => Math.max(1, ...Array.from(slotAvailability.values())),
    [slotAvailability],
  );

  const bestSlotLabel = useMemo(() => {
    let bestKey: string | null = null;
    let bestValue = 0;

    slotAvailability.forEach((count, key) => {
      if (availableSlots.has(key) && count > bestValue) {
        bestValue = count;
        bestKey = key;
      }
    });

    if (!bestKey || bestValue === 0) return "Ingen dekning";

    const { date, minute } = parseSlotKey(bestKey);
    const { weekday } = formatDateHeader(date);
    return `${weekday} ${formatTime(minute)}`;
  }, [availableSlots, slotAvailability]);

  const getHeatIntensity = (date: string, minute: number): number => {
    const count = slotAvailability.get(makeSlotKey(date, minute)) || 0;
    return count / maxCount;
  };

  const getAvailableCount = (date: string, minute: number): number => {
    return slotAvailability.get(makeSlotKey(date, minute)) || 0;
  };

  const isSlotEnabled = (date: string, minute: number): boolean => {
    return availableSlots.has(makeSlotKey(date, minute));
  };

  const setMode = (mode: FilterMode) => {
    setFilterMode(mode);
    if (mode !== "people") {
      setSelectedIndividual(null);
    }
  };

  return (
    <Container>
      <FilterBar>
        <FilterButtons>
          <FilterButton
            type="button"
            $active={filterMode === "all"}
            onClick={() => setMode("all")}
          >
            Alle <span>{interviewers.length}</span>
          </FilterButton>
          <FilterButton
            type="button"
            $active={filterMode === "male"}
            onClick={() => setMode("male")}
          >
            Menn{" "}
            <span>{interviewers.filter((i) => i.gender === "M").length}</span>
          </FilterButton>
          <FilterButton
            type="button"
            $active={filterMode === "female"}
            onClick={() => setMode("female")}
          >
            Kvinner{" "}
            <span>{interviewers.filter((i) => i.gender === "F").length}</span>
          </FilterButton>
        </FilterButtons>

        <SelectWrap>
          <SelectLabel htmlFor="person-filter">Person</SelectLabel>
          <IndividualSelect
            id="person-filter"
            value={selectedIndividual || ""}
            onChange={(e) => {
              const value = e.target.value || null;
              setSelectedIndividual(value);
              setFilterMode(value ? "people" : "all");
            }}
          >
            <option value="">Velg person...</option>
            {interviewers.map((interviewer) => (
              <option key={interviewer.id} value={interviewer.id}>
                {interviewer.name}
              </option>
            ))}
          </IndividualSelect>
        </SelectWrap>
      </FilterBar>

      <HeatmapSection>
        <HeatmapHeader>
          <div>
            <LegendLabel>Tilgjengelighet</LegendLabel>
            <LegendScale>
              <LegendBox $intensity={0} />
              <LegendBox $intensity={0.25} />
              <LegendBox $intensity={0.5} />
              <LegendBox $intensity={0.75} />
              <LegendBox $intensity={1} />
              <LegendInfo>0 til {maxCount}</LegendInfo>
            </LegendScale>
          </div>
        </HeatmapHeader>

        <GridWrapper>
          <Grid $columns={dates.length + 1}>
            <div />
            {dates.map((date) => {
              const { weekday, dayMonth } = formatDateHeader(date);
              return (
                <HeaderCell key={date}>
                  <span>{weekday}</span>
                  <DateSubLabel>{dayMonth}</DateSubLabel>
                </HeaderCell>
              );
            })}

            {TIME_SLOTS.map((minute) => (
              <React.Fragment key={minute}>
                <TimeLabel>{formatTime(minute)}</TimeLabel>
                {dates.map((date) => {
                  const enabled = isSlotEnabled(date, minute);
                  const intensity = getHeatIntensity(date, minute);
                  const count = getAvailableCount(date, minute);

                  return (
                    <HeatmapSlot
                      key={makeSlotKey(date, minute)}
                      $intensity={intensity}
                      $enabled={enabled}
                      title={enabled ? `${count} tilgjengelig` : "Ikke tilgjengelig"}
                    >
                      {enabled && count > 0 && (
                        <SlotCount $darkText={intensity < 0.45}>
                          {count}
                        </SlotCount>
                      )}
                    </HeatmapSlot>
                  );
                })}
              </React.Fragment>
            ))}
          </Grid>
        </GridWrapper>
      </HeatmapSection>

      <SummaryGrid>
        <SummaryCard>
          <SummaryLabel>Aktive intervjuere</SummaryLabel>
          <SummaryValue>{filteredInterviewers.length}</SummaryValue>
        </SummaryCard>
        <SummaryCard>
          <SummaryLabel>Dekning</SummaryLabel>
          <SummaryValue>{slotAvailability.size} slotter</SummaryValue>
        </SummaryCard>
        <SummaryCard>
          <SummaryLabel>Beste åpne luke</SummaryLabel>
          <SummaryValue>{bestSlotLabel}</SummaryValue>
        </SummaryCard>
      </SummaryGrid>
    </Container>
  );
};

export default AvailabilityHeatmap;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
`;

const FilterBar = styled.div`
  ${scheduleSurface};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.875rem 1rem;
`;

const FilterButtons = styled.div`
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
`;

const FilterButton = styled.button<{ $active: boolean }>`
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.12s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 600;
  font-size: 0.813rem;

  ${(props) =>
    props.$active
      ? css`
          background: rgba(178, 18, 7, 0.07);
          color: var(--lego-red-color);
          border: 1px solid rgba(178, 18, 7, 0.18);
        `
      : css`
          background: transparent;
          color: #6b6b6b;
          border: 1px solid transparent;

          &:hover {
            background: #f0f0f0;
            border-color: #e4e4e4;
            color: #111111;
          }
        `}

  span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.4rem;
    height: 1.4rem;
    padding: 0 0.3rem;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.06);
    font-size: 0.688rem;
    font-weight: 700;
  }
`;

const SelectWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const SelectLabel = styled.label`
  ${scheduleLabel};
`;

const IndividualSelect = styled.select`
  min-width: 170px;
  ${scheduleInput};
  cursor: pointer;
`;

const HeatmapSection = styled.div`
  ${scheduleSurface};
  padding: 1.25rem;
  min-width: 0;
`;

const HeatmapHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
`;

const LegendLabel = styled.span`
  ${scheduleLabel};
  display: block;
  margin-bottom: 0.35rem;
`;

const LegendScale = styled.div`
  display: flex;
  align-items: center;
  gap: 3px;
`;

const LegendBox = styled.div<{ $intensity: number }>`
  width: 1.4rem;
  height: 0.75rem;
  border-radius: 3px;
  background: ${(props) => {
    if (props.$intensity === 0) return "#f0f0f0";
    const intensity = 0.12 + props.$intensity * 0.78;
    return `rgba(178, 18, 7, ${intensity})`;
  }};
`;

const LegendInfo = styled.span`
  margin-left: 0.4rem;
  color: #a0a0a0;
  font-size: 0.75rem;
  font-weight: 600;
`;

const LegendSummary = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  color: #a0a0a0;
  font-size: 0.75rem;
  font-weight: 600;
  text-align: right;

  strong {
    color: #111111;
    font-size: 0.875rem;
    font-weight: 700;
  }
`;

const GridWrapper = styled.div`
  ${scheduleGridShell};
  min-width: 0;
`;

const Grid = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: 56px repeat(${(props) => props.$columns - 1}, minmax(70px, 1fr));
  gap: 5px;
  min-width: max(680px, ${(props) => (props.$columns - 1) * 70 + 56}px);
`;

const DateSubLabel = styled.span`
  font-size: 0.688rem;
  font-weight: 600;
  color: #a0a0a0;
  display: block;
`;

const HeaderCell = styled.div`
  ${scheduleGridHeaderCell};
  flex-direction: column;
  gap: 0.1rem;
`;

const TimeLabel = styled.div`
  ${scheduleGridTimeLabel};
`;

const HeatmapSlot = styled.div<{ $intensity: number; $enabled: boolean }>`
  height: 2.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: background-color 0.1s ease;

  ${(props) =>
    !props.$enabled
      ? css`
          background: #f0f0f0;
          border: 1px solid #e4e4e4;
          opacity: 0.4;
        `
      : css`
          background: ${props.$intensity === 0
            ? "#ffffff"
            : `rgba(178, 18, 7, ${0.12 + props.$intensity * 0.78})`};
          border: 1px solid
            ${props.$intensity === 0 ? "#e4e4e4" : "rgba(178, 18, 7, 0.15)"};
        `}
`;

const SlotCount = styled.span<{ $darkText: boolean }>`
  font-size: 0.75rem;
  font-weight: 700;
  color: ${(props) => (props.$darkText ? "#b21207" : "#ffffff")};
`;

const SummaryGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  padding-top: 0.875rem;
  border-top: 1px solid #e4e4e4;
`;

const SummaryCard = styled.div`
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
`;

const SummaryLabel = styled.span`
  ${scheduleLabel};
`;

const SummaryValue = styled.span`
  color: #111111;
  font-size: 0.875rem;
  font-weight: 700;
`;
