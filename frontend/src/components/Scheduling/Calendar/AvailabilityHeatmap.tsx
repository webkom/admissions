import React, { useState, useMemo } from "react";
import styled, { css } from "styled-components";
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
  availableSlots: Set<string>; // Slots that admins have enabled
  startHour?: number;
  endHour?: number;
}

type FilterMode = "all" | "male" | "female" | "people";

const AvailabilityHeatmap: React.FC<AvailabilityHeatmapProps> = ({
  interviewers,
  availableSlots,
  startHour = 8,
  endHour = 16,
}) => {
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedIndividual, setSelectedIndividual] = useState<string | null>(
    null,
  );

  const HOURS = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => i + startHour),
    [startHour, endHour],
  );

  // Filter interviewers based on filter mode
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

  // Calculate availability count per slot
  const slotAvailability = useMemo(() => {
    const counts = new Map<string, number>();

    filteredInterviewers.forEach((interviewer) => {
      interviewer.availability.forEach((slot) => {
        const day = Math.floor(slot / 24);
        const hour = slot % 24;
        const slotKey = `${day}-${hour}`;
        counts.set(slotKey, (counts.get(slotKey) || 0) + 1);
      });
    });

    return counts;
  }, [filteredInterviewers]);

  // Max count for color scaling
  const maxCount = useMemo(() => {
    return Math.max(1, ...Array.from(slotAvailability.values()));
  }, [slotAvailability]);

  // Intensity between 0 and 1 based on the count
  const getHeatIntensity = (dayIndex: number, hour: number): number => {
    const slotKey = `${dayIndex}-${hour}`;
    const count = slotAvailability.get(slotKey) || 0;
    return count / maxCount;
  };

  const getAvailableCount = (dayIndex: number, hour: number): number => {
    const slotKey = `${dayIndex}-${hour}`;
    return slotAvailability.get(slotKey) || 0;
  };

  const isSlotEnabled = (dayIndex: number, hour: number): boolean => {
    const slotKey = `${dayIndex}-${hour}`;
    return availableSlots.has(slotKey);
  };

  return (
    <Container>
      <FilterBar>
        <FilterGroup>
          <FilterButtons>
            <FilterButton
              $active={filterMode === "all"}
              onClick={() => setFilterMode("all")}
            >
              Alle <span>{interviewers.length}</span>
            </FilterButton>
            <FilterButton
              $active={filterMode === "male"}
              onClick={() => setFilterMode("male")}
            >
              Menn{" "}
              <span>{interviewers.filter((i) => i.gender === "M").length}</span>
            </FilterButton>
            <FilterButton
              $active={filterMode === "female"}
              onClick={() => setFilterMode("female")}
            >
              Kvinner{" "}
              <span>{interviewers.filter((i) => i.gender === "F").length}</span>
            </FilterButton>
            <IndividualSelectWrapper>
              <IndividualSelect
                value={selectedIndividual || ""}
                onChange={(e) => setSelectedIndividual(e.target.value || null)}
              >
                <option value="">Velg person...</option>
                {interviewers.map((interviewer) => (
                  <option key={interviewer.id} value={interviewer.id}>
                    {interviewer.name}
                  </option>
                ))}
              </IndividualSelect>
            </IndividualSelectWrapper>
          </FilterButtons>
        </FilterGroup>
      </FilterBar>

      <HeatmapSection>
        <HeatmapHeader>
          <Legend>
            <LegendLabel>Tilgjengelighet</LegendLabel>
            <LegendScale>
              <LegendBox $intensity={0} />
              <LegendBox $intensity={0.25} />
              <LegendBox $intensity={0.5} />
              <LegendBox $intensity={0.75} />
              <LegendBox $intensity={1} />
              <LegendInfo>0 — {maxCount}</LegendInfo>
            </LegendScale>
          </Legend>
        </HeatmapHeader>

        {/* Heatmap Grid */}
        <GridWrapper>
          <Grid $columns={DAYS.length + 1}>
            {/* Header row */}
            <div /> {/* Empty corner cell */}
            {DAYS.map((day) => (
              <HeaderCell key={day}>{day}</HeaderCell>
            ))}
            {/* Time rows */}
            {HOURS.map((hour) => (
              <React.Fragment key={hour}>
                <TimeLabel>{hour}:00</TimeLabel>
                {DAYS.map((day, dayIndex) => {
                  const enabled = isSlotEnabled(dayIndex, hour);
                  const intensity = getHeatIntensity(dayIndex, hour);
                  const count = getAvailableCount(dayIndex, hour);

                  return (
                    <HeatmapSlot
                      key={`${dayIndex}-${hour}`}
                      $intensity={intensity}
                      $enabled={enabled}
                      title={
                        enabled ? `${count} tilgjengelig` : "Ikke tilgjengelig"
                      }
                    >
                      {enabled && count > 0 && (
                        <SlotCount $darkText={intensity < 0.4}>
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
          <SummaryLabel>Dekning (tidsluker)</SummaryLabel>
          <SummaryValue>{slotAvailability.size}</SummaryValue>
        </SummaryCard>
        <SummaryCard>
          <SummaryLabel>Beste tidsluke</SummaryLabel>
          <SummaryValue>{maxCount}</SummaryValue>
        </SummaryCard>
      </SummaryGrid>
    </Container>
  );
};

export default AvailabilityHeatmap;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const FilterBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
`;

const FilterGroup = styled.div`
  background: var(--color-gray-1);
  padding: 0.3rem;
  border-radius: 0.75rem;
  border: 1px solid var(--border-gray);
`;

const FilterButtons = styled.div`
  display: flex;
  gap: 0.2rem;
`;

const FilterButton = styled.button<{ $active: boolean }>`
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: ${(props) => (props.$active ? "600" : "500")};
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  ${(props) =>
    props.$active
      ? css`
          background: var(--lego-card-color);
          color: var(--lego-font-color);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        `
      : css`
          background: transparent;
          color: var(--color-gray-6);

          &:hover {
            color: var(--lego-font-color);
            background: rgba(0, 0, 0, 0.03);
          }
        `}

  span {
    font-size: 0.75rem;
    background: ${(props) =>
      props.$active ? "var(--color-gray-2)" : "var(--color-gray-2)"};
    padding: 0.1rem 0.4rem;
    border-radius: 1rem;
    opacity: 0.8;
  }
`;

const IndividualSelectWrapper = styled.div`
  flex: 1;
  max-width: 250px;
`;

const IndividualSelect = styled.select`
  width: 100%;
  padding: 0.6rem 1rem;
  font-size: 0.875rem;
  border: 1px solid var(--border-gray);
  border-radius: 0.75rem;
  background: var(--lego-card-color);
  color: var(--lego-font-color);
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

  &:focus {
    outline: none;
    border-color: var(--lego-font-color);
  }
`;

const HeatmapSection = styled.div`
  background: var(--lego-card-color);
  border: 1px solid var(--border-gray);
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
`;

const HeatmapHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
`;

const Legend = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const LegendLabel = styled.span`
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-gray-5);
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const LegendScale = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
`;

const LegendBox = styled.div<{ $intensity: number }>`
  width: 1.5rem;
  height: 0.75rem;
  background: ${(props) => {
    if (props.$intensity === 0) return "var(--color-gray-1)";
    const intensity = 0.1 + props.$intensity * 0.9;
    return `rgba(34, 197, 94, ${intensity})`;
  }};
  border-radius: 2px;
`;

const LegendInfo = styled.span`
  font-size: 0.75rem;
  color: var(--color-gray-5);
  margin-left: 0.5rem;
  font-weight: 600;
`;

const GridWrapper = styled.div`
  overflow-x: auto;
  margin: 0 -0.5rem;
  padding: 0 0.5rem;
`;

const Grid = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: 60px repeat(${(props) => props.$columns - 1}, 1fr);
  gap: 4px;
  min-width: 600px;
`;

const HeaderCell = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
  text-align: center;
  color: var(--color-gray-5);
  padding: 0.5rem 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.025em;
`;

const TimeLabel = styled.div`
  font-size: 11px;
  font-weight: 600;
  color: var(--color-gray-4);
  text-align: right;
  padding-right: 1rem;
  display: flex;
  align-items: center;
  justify-content: flex-end;
`;

const HeatmapSlot = styled.div<{ $intensity: number; $enabled: boolean }>`
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;

  ${(props) =>
    !props.$enabled
      ? css`
          background: var(--color-gray-1);
          opacity: 0.3;
          cursor: not-allowed;
          background-image: repeating-linear-gradient(
            45deg,
            transparent,
            transparent 5px,
            rgba(0, 0, 0, 0.02) 5px,
            rgba(0, 0, 0, 0.02) 10px
          );
        `
      : css`
          background: ${props.$intensity === 0
            ? "var(--color-gray-1)"
            : `rgba(34, 197, 94, ${0.1 + props.$intensity * 0.9})`};
          cursor: pointer;

          &:hover {
            transform: scale(1.08);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
            z-index: 10;
          }
        `}
`;

const SlotCount = styled.span<{ $darkText: boolean }>`
  font-size: 0.75rem;
  font-weight: 700;
  color: ${(props) => (props.$darkText ? "var(--color-green-7)" : "white")};
  text-shadow: ${(props) =>
    props.$darkText ? "none" : "0 1px 2px rgba(0,0,0,0.1)"};
`;

const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
`;

const SummaryCard = styled.div`
  background: var(--lego-card-color);
  border: 1px solid var(--border-gray);
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const SummaryLabel = styled.span`
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--color-gray-5);
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const SummaryValue = styled.span`
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--lego-font-color);
`;
