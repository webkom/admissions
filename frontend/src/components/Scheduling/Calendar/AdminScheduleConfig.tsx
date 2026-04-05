import React, { useState, useEffect, useCallback } from "react";
import styled, { css } from "styled-components";
import { media } from "src/styles/mediaQueries";
import { Check } from "lucide-react";
import {
  primaryAction,
  scheduleInset,
  scheduleLabel,
  scheduleSurface,
  secondaryAction,
} from "../shared";
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
  sessionDuration: number;
  onSessionDurationChange: (duration: number) => void;
}

const AdminScheduleConfig: React.FC<AdminScheduleConfigProps> = ({
  enabledSlots,
  onSlotsChange,
  startHour = 8,
  endHour = 18,
  onSave,
  sessionDuration,
  onSessionDurationChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<"add" | "remove">("add");
  const [isSaving, setIsSaving] = useState(false);
  const [inputValue, setInputValue] = useState<string>(
    sessionDuration.toString(),
  );

  useEffect(() => {
    setInputValue(sessionDuration.toString());
  }, [sessionDuration]);

  const startMinute = startHour * 60;
  const endMinute = endHour * 60;

  const TIME_SLOTS = React.useMemo(() => {
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
    if (!onSave || sessionDuration === 0) return;
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
      <HeaderCard>
        <HeaderMain>
          <div>
            <Eyebrow>Rammer</Eyebrow>
            <Title>Styr hvilke slotter som er åpne</Title>
          </div>
          <SupportText>
            Sett et tydelig tidsrom først. Da blir både tilgjengelighet og
            planforslag langt mer forutsigbare.
          </SupportText>
        </HeaderMain>

        <HeaderActions>
          <ActionGroup>
            <ActionButton type="button" onClick={selectAll}>
              Velg alle
            </ActionButton>
            <ActionButton type="button" onClick={clearAll}>
              Tøm alle
            </ActionButton>
          </ActionGroup>

          <DurationWrapper>
            <DurationLabel htmlFor="session-duration">Varighet</DurationLabel>
            <DurationInput
              id="session-duration"
              type="number"
              min="0"
              max="120"
              step="5"
              value={inputValue}
              onChange={(e) => {
                const valStr = e.target.value;
                setInputValue(valStr);
                const val = parseInt(valStr, 10);
                if (!isNaN(val)) {
                  onSessionDurationChange(val);
                } else if (valStr === "") {
                  onSessionDurationChange(0);
                }
              }}
            />
            <DurationUnit>min</DurationUnit>
          </DurationWrapper>

          {onSave && (
            <SaveButton
              type="button"
              onClick={handleSave}
              disabled={isSaving || sessionDuration === 0}
            >
              {isSaving ? "Lagrer..." : "Lagre oppsett"}
            </SaveButton>
          )}
        </HeaderActions>
      </HeaderCard>

      <GridWrapper>
        <Grid $columns={DAYS.length + 1}>
          <div />
          {DAYS.map((day, dayIndex) => {
            const isAllSelected =
              TIME_SLOTS.length > 0 &&
              TIME_SLOTS.every((minute) =>
                enabledSlots.has(`${dayIndex}-${minute}`),
              );
            const isSomeSelected = TIME_SLOTS.some((minute) =>
              enabledSlots.has(`${dayIndex}-${minute}`),
            );

            return (
              <DayHeader key={day}>
                <DayName>{day}</DayName>
                <DayToggle>
                  <input
                    type="checkbox"
                    disabled={TIME_SLOTS.length === 0}
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
                  Hele dagen
                </DayToggle>
              </DayHeader>
            );
          })}

          {TIME_SLOTS.map((minute) => (
            <React.Fragment key={minute}>
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
                    {isEnabled && <Check size={14} />}
                  </ConfigSlot>
                );
              })}
            </React.Fragment>
          ))}
        </Grid>
      </GridWrapper>

      <StatsRow>
        <StatCard>
          <StatLabel>Åpne slotter</StatLabel>
          <StatValue>{enabledSlots.size}</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Varighet</StatLabel>
          <StatValue>{sessionDuration || 0} min</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Søkere</StatLabel>
          <StatValue>{MOCK_CANDIDATES.length}</StatValue>
        </StatCard>
      </StatsRow>
    </Container>
  );
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  user-select: none;
`;

const HeaderCard = styled.div`
  ${scheduleSurface};
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem;
`;

const HeaderMain = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  flex-wrap: wrap;
`;

const Eyebrow = styled.span`
  ${scheduleLabel};
  display: block;
  margin-bottom: 0.3rem;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 1.1rem;
  color: #111827;
`;

const SupportText = styled.p`
  max-width: 34rem;
  margin: 0;
  color: #5b554c;
  line-height: 1.7;
  font-size: 0.92rem;
`;

const HeaderActions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;

  ${media.handheld`
    align-items: stretch;
  `};
`;

const ActionGroup = styled.div`
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
`;

const ActionButton = styled.button`
  ${secondaryAction};
  padding: 0.7rem 0.95rem;
  border-radius: 0.9rem;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
`;

const DurationWrapper = styled.div`
  ${scheduleInset};
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.75rem;
`;

const DurationLabel = styled.label`
  ${scheduleLabel};
  color: #7b6b5c;
`;

const DurationInput = styled.input`
  width: 4.5rem;
  padding: 0.5rem 0.55rem;
  border-radius: 0.75rem;
  border: 1px solid #d7cbbb;
  background: rgba(255, 255, 255, 0.85);
  color: #111827;
  text-align: center;
  font-weight: 700;
  font-size: 0.95rem;

  &:focus {
    outline: none;
    border-color: #8a1f16;
    box-shadow: 0 0 0 3px rgba(178, 18, 7, 0.08);
  }
`;

const DurationUnit = styled.span`
  color: #6b7280;
  font-size: 0.85rem;
  font-weight: 600;
`;

const SaveButton = styled.button`
  ${primaryAction};
  padding: 0.8rem 1.15rem;
  border-radius: 0.9rem;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
`;

const GridWrapper = styled.div`
  ${scheduleSurface};
  overflow-x: auto;
  padding: 0.95rem;
`;

const Grid = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: 70px repeat(${(props) => props.$columns - 1}, 1fr);
  gap: 8px;
  min-width: 820px;
`;

const DayHeader = styled.div`
  ${scheduleInset};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
  padding: 0.9rem 0.4rem;
`;

const DayName = styled.div`
  ${scheduleLabel};
  color: #6e6256;
  text-align: center;
`;

const DayToggle = styled.label`
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: #6b7280;
  font-size: 0.76rem;
  font-weight: 600;
`;

const TimeLabel = styled.div`
  ${scheduleLabel};
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 0.6rem;
  color: #8a7b6b;
`;

const ConfigSlot = styled.div<{ $isEnabled: boolean }>`
  height: 2.9rem;
  border-radius: 0.95rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease,
    background-color 0.12s ease;
  cursor: pointer;

  ${(props) =>
    props.$isEnabled
      ? css`
          color: white;
          background: linear-gradient(135deg, #8a1f16 0%, #6d1a13 100%);
          border: 1px solid #7f1d1d;

          &:hover {
            transform: translateY(-1px);
            box-shadow: 0 14px 20px -18px rgba(109, 26, 19, 0.9);
          }
        `
      : css`
          background: rgba(255, 255, 255, 0.88);
          border: 1px solid #dfd4c6;

          &:hover {
            border-color: #c8b9a5;
            box-shadow: 0 12px 18px -18px rgba(51, 37, 24, 0.45);
          }
        `}
`;

const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
`;

const StatCard = styled.div`
  ${scheduleSurface};
  padding: 0.95rem 1rem;
`;

const StatValue = styled.span`
  display: block;
  margin-top: 0.3rem;
  font-size: 1.35rem;
  font-weight: 800;
  color: #111827;
`;

const StatLabel = styled.span`
  ${scheduleLabel};
`;

export default AdminScheduleConfig;
