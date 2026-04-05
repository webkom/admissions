import React, { useState, useMemo } from "react";
import styled, { css } from "styled-components";
import { scheduleInset, scheduleLabel, scheduleSurface } from "../shared";
import type { Interviewer } from "../types";

const DAYS = [
  "Mandag",
  "Tysdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
];

interface AvailabilityHeatmapProps {
  interviewers: Interviewer[];
  availableSlots: Set<string>;
  startHour?: number;
  endHour?: number;
  sessionDuration: number;
}

type FilterMode = "all" | "male" | "female" | "people";

const AvailabilityHeatmap: React.FC<AvailabilityHeatmapProps> = ({
  interviewers,
  availableSlots,
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
        const slotKey =
          typeof slot === "string"
            ? slot
            : `${Math.floor(slot / 24)}-${(slot % 24) * 60}`;
        counts.set(slotKey, (counts.get(slotKey) || 0) + 1);
      });
    });

    return counts;
  }, [filteredInterviewers]);

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

    if (!bestKey || bestValue === 0) {
      return "Ingen dekning";
    }

    const [dayIndex, minute] = bestKey.split("-");
    return `${DAYS[Number(dayIndex)].slice(0, 3)} ${formatTime(Number(minute))}`;
  }, [availableSlots, slotAvailability]);

  const getHeatIntensity = (dayIndex: number, minute: number): number => {
    const slotKey = `${dayIndex}-${minute}`;
    const count = slotAvailability.get(slotKey) || 0;
    return count / maxCount;
  };

  const getAvailableCount = (dayIndex: number, minute: number): number => {
    const slotKey = `${dayIndex}-${minute}`;
    return slotAvailability.get(slotKey) || 0;
  };

  const isSlotEnabled = (dayIndex: number, minute: number): boolean => {
    const slotKey = `${dayIndex}-${minute}`;
    return availableSlots.has(slotKey);
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
          <LegendSummary>
            Beste åpne luke
            <strong>{bestSlotLabel}</strong>
          </LegendSummary>
        </HeatmapHeader>

        <GridWrapper>
          <Grid $columns={DAYS.length + 1}>
            <div />
            {DAYS.map((day) => (
              <HeaderCell key={day}>{day}</HeaderCell>
            ))}

            {TIME_SLOTS.map((minute) => (
              <React.Fragment key={minute}>
                <TimeLabel>{formatTime(minute)}</TimeLabel>
                {DAYS.map((_, dayIndex) => {
                  const enabled = isSlotEnabled(dayIndex, minute);
                  const intensity = getHeatIntensity(dayIndex, minute);
                  const count = getAvailableCount(dayIndex, minute);

                  return (
                    <HeatmapSlot
                      key={`${dayIndex}-${minute}`}
                      $intensity={intensity}
                      $enabled={enabled}
                      title={
                        enabled ? `${count} tilgjengelig` : "Ikke tilgjengelig"
                      }
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
  gap: 1rem;
`;

const FilterBar = styled.div`
  ${scheduleSurface};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.85rem;
  flex-wrap: wrap;
  padding: 1rem;
`;

const FilterButtons = styled.div`
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
`;

const FilterButton = styled.button<{ $active: boolean }>`
  padding: 0.7rem 0.95rem;
  border-radius: 0.9rem;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-weight: 700;
  font-size: 0.86rem;

  ${(props) =>
    props.$active
      ? css`
          background: rgba(178, 18, 7, 0.08);
          color: #8a1f16;
          border: 1px solid rgba(178, 18, 7, 0.2);
        `
      : css`
          background: rgba(255, 255, 255, 0.82);
          color: #4b5563;
          border: 1px solid #ddd2c3;

          &:hover {
            transform: translateY(-1px);
            border-color: #ccbca5;
            color: #111827;
          }
        `}

  span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.7rem;
    height: 1.7rem;
    padding: 0 0.4rem;
    border-radius: 999px;
    background: rgba(17, 24, 39, 0.06);
    color: inherit;
    font-size: 0.76rem;
  }
`;

const SelectWrap = styled.div`
  ${scheduleInset};
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.7rem;
`;

const SelectLabel = styled.label`
  ${scheduleLabel};
`;

const IndividualSelect = styled.select`
  min-width: 190px;
  padding: 0.55rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #d7cbbb;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.86);
  color: #111827;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #8a1f16;
    box-shadow: 0 0 0 3px rgba(178, 18, 7, 0.08);
  }
`;

const HeatmapSection = styled.div`
  ${scheduleSurface};
  padding: 1.15rem;
`;

const HeatmapHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
`;

const LegendLabel = styled.span`
  ${scheduleLabel};
  display: block;
  margin-bottom: 0.4rem;
`;

const LegendScale = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
`;

const LegendBox = styled.div<{ $intensity: number }>`
  width: 1.65rem;
  height: 0.9rem;
  border-radius: 0.3rem;
  background: ${(props) => {
    if (props.$intensity === 0) return "#f0e8dd";
    const intensity = 0.14 + props.$intensity * 0.86;
    return `rgba(31, 122, 92, ${intensity})`;
  }};
`;

const LegendInfo = styled.span`
  margin-left: 0.4rem;
  color: #6b7280;
  font-size: 0.82rem;
  font-weight: 600;
`;

const LegendSummary = styled.div`
  ${scheduleInset};
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.75rem 0.85rem;
  color: #6b7280;
  font-size: 0.82rem;

  strong {
    color: #111827;
    font-size: 1rem;
  }
`;

const GridWrapper = styled.div`
  ${scheduleInset};
  overflow-x: auto;
  padding: 0.85rem;
`;

const Grid = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: 68px repeat(${(props) => props.$columns - 1}, 1fr);
  gap: 8px;
  min-width: 760px;
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

const HeatmapSlot = styled.div<{ $intensity: number; $enabled: boolean }>`
  height: 2.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.95rem;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;

  ${(props) =>
    !props.$enabled
      ? css`
          background: repeating-linear-gradient(
            45deg,
            #efe6d8,
            #efe6d8 6px,
            #faf5ee 6px,
            #faf5ee 12px
          );
          border: 1px solid #ddd2c3;
          opacity: 0.5;
        `
      : css`
          background: ${props.$intensity === 0
            ? "rgba(255, 255, 255, 0.86)"
            : `rgba(31, 122, 92, ${0.14 + props.$intensity * 0.86})`};
          border: 1px solid
            ${props.$intensity === 0 ? "#dfd4c6" : "rgba(20, 83, 45, 0.18)"};

          &:hover {
            transform: translateY(-1px) scale(1.02);
            box-shadow: 0 14px 18px -18px rgba(21, 83, 45, 0.7);
          }
        `}
`;

const SlotCount = styled.span<{ $darkText: boolean }>`
  font-size: 0.82rem;
  font-weight: 800;
  color: ${(props) => (props.$darkText ? "#14532d" : "#ffffff")};
`;

const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
`;

const SummaryCard = styled.div`
  ${scheduleSurface};
  padding: 0.95rem 1rem;
`;

const SummaryLabel = styled.span`
  ${scheduleLabel};
  display: block;
  margin-bottom: 0.3rem;
`;

const SummaryValue = styled.span`
  display: block;
  color: #111827;
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1.4;
`;
