import React, { useState, useEffect, useCallback } from "react";
import styled, { css } from "styled-components";
import { Check } from "lucide-react";
import { MOCK_CANDIDATES } from "../../../routes/SchedulePage/mockData";

const DAYS = [
  "Mandag",
  "Tysdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
];

interface AdminScheduleConfigProps {
  enabledSlots: Set<string>;
  onSlotsChange: (slots: Set<string>) => void;
  startHour?: number;
  endHour?: number;
  onSave?: (slots: Set<string>) => Promise<void>;
}

const AdminScheduleConfig: React.FC<AdminScheduleConfigProps> = ({
  enabledSlots,
  onSlotsChange,
  startHour = 8,
  endHour = 18,
  onSave,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<"add" | "remove">("add");
  const [isSaving, setIsSaving] = useState(false);

  // NEW: State for the custom session duration
  const [sessionDuration, setSessionDuration] = useState<number>(60);

  // NEW: Calculate slots based on minutes, safely avoiding infinite loops
  const startMinute = startHour * 60;
  const endMinute = endHour * 60;

  const TIME_SLOTS = React.useMemo(() => {
    const slots = [];
    const step = sessionDuration > 0 ? sessionDuration : 60; // Fallback to prevent crash
    for (let m = startMinute; m < endMinute; m += step) {
      slots.push(m);
    }
    return slots;
  }, [startMinute, endMinute, sessionDuration]);

  // NEW: Format minutes back to readable HH:MM
  const formatTime = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, "0")}`;
  };

  const applyToggle = useCallback(
    (
      dayIndex: number,
      minute: number,
      mode: "add" | "remove",
      currentSlots: Set<string>,
    ) => {
      const slotKey = `${dayIndex}-${minute}`;
      const newSlots = new Set(currentSlots);

      if (mode === "add") {
        newSlots.add(slotKey);
      } else {
        newSlots.delete(slotKey);
      }

      onSlotsChange(newSlots);
    },
    [onSlotsChange],
  );

  const handleMouseDown = (dayIndex: number, minute: number) => {
    const slotKey = `${dayIndex}-${minute}`;
    const isSelected = enabledSlots.has(slotKey);
    const newMode = isSelected ? "remove" : "add";
    setDragMode(newMode);
    setIsDragging(true);
    applyToggle(dayIndex, minute, newMode, enabledSlots);
  };

  const handleMouseEnter = (dayIndex: number, minute: number) => {
    if (isDragging) {
      applyToggle(dayIndex, minute, dragMode, enabledSlots);
    }
  };

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(enabledSlots);
    } finally {
      setIsSaving(false);
    }
  };

  const selectAllForDay = (dayIndex: number) => {
    const newSlots = new Set(enabledSlots);
    TIME_SLOTS.forEach((minute) => {
      newSlots.add(`${dayIndex}-${minute}`);
    });
    onSlotsChange(newSlots);
  };

  const clearAllForDay = (dayIndex: number) => {
    const newSlots = new Set(enabledSlots);
    TIME_SLOTS.forEach((minute) => {
      newSlots.delete(`${dayIndex}-${minute}`);
    });
    onSlotsChange(newSlots);
  };

  const selectAll = () => {
    const newSlots = new Set<string>();
    DAYS.forEach((_, dayIndex) => {
      TIME_SLOTS.forEach((minute) => {
        newSlots.add(`${dayIndex}-${minute}`);
      });
    });
    onSlotsChange(newSlots);
  };

  const clearAll = () => {
    onSlotsChange(new Set());
  };

  return (
    <Container>
      <HeaderActions>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <ActionButton onClick={selectAll}>Velg alle</ActionButton>
          <ActionButton onClick={clearAll}>Tøm alle</ActionButton>

          {/* NEW: Input for session duration */}
          <DurationWrapper>
            <DurationLabel>Varighet (min)</DurationLabel>
            <DurationInput
              type="number"
              min="5"
              max="120"
              step="5"
              value={sessionDuration}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val > 0) {
                  setSessionDuration(val);
                }
              }}
            />
          </DurationWrapper>
        </div>
        {onSave && (
          <SaveButton onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Lagrer..." : "Lagre oppsett"}
          </SaveButton>
        )}
      </HeaderActions>

      <GridWrapper>
        <Grid $columns={DAYS.length + 1}>
          <div />
          {DAYS.map((day, dayIndex) => {
            const isAllSelected = TIME_SLOTS.every((minute) =>
              enabledSlots.has(`${dayIndex}-${minute}`),
            );
            const isSomeSelected = TIME_SLOTS.some((minute) =>
              enabledSlots.has(`${dayIndex}-${minute}`),
            );

            return (
              <DayHeader key={day}>
                <DayName>{day}</DayName>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(input) => {
                    if (input)
                      input.indeterminate = isSomeSelected && !isAllSelected;
                  }}
                  onChange={() => {
                    if (isAllSelected) {
                      clearAllForDay(dayIndex);
                    } else {
                      selectAllForDay(dayIndex);
                    }
                  }}
                />
              </DayHeader>
            );
          })}

          {TIME_SLOTS.map((minute) => (
            <React.Fragment key={minute}>
              {/* NEW: Use the formatter for the Y-axis label */}
              <TimeLabel>{formatTime(minute)}</TimeLabel>
              {DAYS.map((_, dayIndex) => {
                const slotKey = `${dayIndex}-${minute}`;
                const isEnabled = enabledSlots.has(slotKey);

                return (
                  <ConfigSlot
                    key={slotKey}
                    $isEnabled={isEnabled}
                    onMouseDown={() => handleMouseDown(dayIndex, minute)}
                    onMouseEnter={() => handleMouseEnter(dayIndex, minute)}
                  >
                    {isEnabled && <Check size={12} />}
                  </ConfigSlot>
                );
              })}
            </React.Fragment>
          ))}
        </Grid>
      </GridWrapper>

      <StatsRow>
        <StatCard>
          <StatLabel>aktiverte tidsluker</StatLabel>
          <StatValue>{enabledSlots.size}</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Antall søkere</StatLabel>
          <StatValue>{MOCK_CANDIDATES.length}</StatValue>
        </StatCard>
      </StatsRow>
    </Container>
  );
};

// --- Styles ---
// Note: I only included the *new* or modified styles here. Keep your existing ones!

const DurationWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: 1rem;
  background: var(--color-gray-1);
  padding: 0.2rem 0.5rem;
  border-radius: 0.4rem;
  border: 1px solid var(--border-gray);
`;

const DurationLabel = styled.label`
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--color-gray-6);
  letter-spacing: 0.05em;
`;

const DurationInput = styled.input`
  width: 3.5rem;
  padding: 0.2rem;
  border: 1px solid var(--border-gray);
  border-radius: 0.25rem;
  text-align: center;
  font-weight: 600;
  color: var(--lego-font-color);
  font-size: 0.8rem;

  &:focus {
    outline: none;
    border-color: var(--lego-font-color);
  }
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  user-select: none;
`;

const HeaderActions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.5rem;
`;

const ActionButton = styled.button`
  padding: 0.5rem 0.75rem;
  font-size: 0.7rem;
  font-weight: 700;
  background: var(--color-gray-1);
  border: 1px solid var(--border-gray);
  border-radius: 0.4rem;
  color: var(--color-gray-7);
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.05em;

  &:hover {
    background: var(--color-gray-2);
    color: var(--lego-font-color);
  }
`;

const SaveButton = styled.button`
  padding: 0.6rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 700;
  background: var(--lego-font-color);
  border: none;
  border-radius: 0.5rem;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: var(--color-black);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const GridWrapper = styled.div`
  background-color: var(--border-gray);
  padding: 1px;
  border-radius: var(--border-radius-sm);
  overflow: hidden;
`;

const Grid = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: 50px repeat(${(props) => props.$columns - 1}, 1fr);
  gap: 4px;
`;

const DayHeader = styled.div`
  background-color: var(--lego-card-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0.25rem;
`;

const DayName = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-gray-5);
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const DayActions = styled.div`
  display: flex;
  gap: 0.25rem;
`;

const SmallButton = styled.button`
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-gray-1);
  border: 1px solid var(--border-gray);
  border-radius: 4px;
  color: var(--color-gray-6);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: var(--color-gray-8);
    color: white;
    border-color: var(--color-gray-8);
  }
`;

const TimeLabel = styled.div`
  background-color: var(--lego-card-color);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-gray-4);
  text-align: right;
  padding-right: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: flex-end;
`;

const ConfigSlot = styled.div<{ $isEnabled: boolean }>`
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${(props) =>
    props.$isEnabled ? "var(--success-color)" : "var(--lego-card-color)"};
  cursor: pointer;
  transition: all 0.1s ease;
  position: relative;

  ${(props) =>
    props.$isEnabled
      ? css`
          color: white;
          &:hover {
            background: var(--color-green-7);
          }
        `
      : css`
          &:hover {
            background: var(--color-gray-1);
          }
        `}
`;

const StatsRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 0 0.5rem;
`;

const StatCard = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
`;

const StatValue = styled.span`
  font-size: 1rem;
  font-weight: 800;
  color: var(--lego-font-color);
`;

const StatLabel = styled.span`
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-gray-5);
`;

export default AdminScheduleConfig;
