import * as React from "react";
import styled, { css } from "styled-components";
import {
  primaryAction,
  scheduleInset,
  scheduleLabel,
  scheduleSurface,
} from "../shared";

const DAYS = [
  "Mandag",
  "Tysdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
];

interface TimeSchedulerProps {
  enabledSlots?: Set<string>;
  selectedSlots?: Set<string>;
  onSlotsChange?: (slots: Set<string>) => void;
  startHour?: number;
  endHour?: number;
  onSave?: (slots: Set<string>) => Promise<void>;
  sessionDuration: number;
}

const TimeScheduler: React.FC<TimeSchedulerProps> = ({
  enabledSlots,
  selectedSlots: externalSelectedSlots,
  onSlotsChange,
  startHour = 8,
  endHour = 18,
  onSave,
  sessionDuration,
}) => {
  const [internalSelectedSlots, setInternalSelectedSlots] = React.useState<
    Set<string>
  >(new Set());
  const selectedSlots = externalSelectedSlots ?? internalSelectedSlots;
  const setSelectedSlots = onSlotsChange ?? setInternalSelectedSlots;

  const [isDragging, setIsDragging] = React.useState(false);
  const [addMode, setAddMode] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

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

  const isSlotEnabled = (dayIndex: number, minute: number): boolean => {
    if (!enabledSlots) return true;
    return enabledSlots.has(`${dayIndex}-${minute}`);
  };

  const toggleSlot = React.useCallback(
    (
      dayIndex: number,
      minute: number,
      mode: boolean,
      currentSlots: Set<string>,
    ) => {
      if (!isSlotEnabled(dayIndex, minute)) return;

      const slotId = `${dayIndex}-${minute}`;
      const next = new Set(currentSlots);

      if (mode) {
        next.add(slotId);
      } else {
        next.delete(slotId);
      }

      setSelectedSlots(next);
    },
    [isSlotEnabled, setSelectedSlots],
  );

  const handleMouseDown = (dayIndex: number, minute: number) => {
    if (!isSlotEnabled(dayIndex, minute)) return;

    const slotId = `${dayIndex}-${minute}`;
    const newAddMode = !selectedSlots.has(slotId);

    setAddMode(newAddMode);
    setIsDragging(true);
    toggleSlot(dayIndex, minute, newAddMode, selectedSlots);
  };

  const handleMouseEnter = (dayIndex: number, minute: number) => {
    if (isDragging && isSlotEnabled(dayIndex, minute)) {
      toggleSlot(dayIndex, minute, addMode, selectedSlots);
    }
  };

  const handleMouseUp = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(selectedSlots);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Wrapper>
      <HeaderRow>
        <div>
          <Eyebrow>Egen kapasitet</Eyebrow>
          <Title>Marker tilgjengelige slotter</Title>
        </div>
        <Legend>
          <LegendItem>
            <LegendDot $variant="selected" />
            Valgt
          </LegendItem>
          <LegendItem>
            <LegendDot $variant="open" />
            Ledig
          </LegendItem>
          <LegendItem>
            <LegendDot $variant="disabled" />
            Stengt
          </LegendItem>
        </Legend>
      </HeaderRow>

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
                const isSelected = selectedSlots.has(`${dayIndex}-${minute}`);

                return (
                  <Slot
                    key={`${dayIndex}-${minute}`}
                    onMouseDown={() => handleMouseDown(dayIndex, minute)}
                    onMouseEnter={() => handleMouseEnter(dayIndex, minute)}
                    $isSelected={isSelected}
                    $isEnabled={enabled}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </Grid>
      </GridWrapper>

      <Footer>
        <FooterInfo>
          <span>Valgte slotter</span>
          <strong>{selectedSlots.size}</strong>
        </FooterInfo>
        <FooterInfo>
          <span>Intervjulengde</span>
          <strong>{sessionDuration} min</strong>
        </FooterInfo>
        <SaveButton onClick={handleSave} disabled={isSaving || !onSave}>
          {isSaving ? "Lagrer..." : "Lagre tilgjengelighet"}
        </SaveButton>
      </Footer>
    </Wrapper>
  );
};

export default TimeScheduler;

const Wrapper = styled.div`
  ${scheduleSurface};
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem;
  user-select: none;
`;

const HeaderRow = styled.div`
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
  color: #111827;
  font-size: 1.1rem;
`;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const LegendItem = styled.span`
  ${scheduleInset};
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.7rem;
  color: #4b5563;
  font-size: 0.82rem;
`;

const LegendDot = styled.span<{ $variant: "selected" | "open" | "disabled" }>`
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 999px;

  ${(props) =>
    props.$variant === "selected"
      ? css`
          background: linear-gradient(135deg, #1f7a5c 0%, #14532d 100%);
        `
      : props.$variant === "open"
        ? css`
            background: #ffffff;
            border: 1px solid #d6ccbf;
          `
        : css`
            background: repeating-linear-gradient(
              45deg,
              #ece4d7,
              #ece4d7 4px,
              #f8f3ed 4px,
              #f8f3ed 8px
            );
            border: 1px solid #d7cebf;
          `}
`;

const GridWrapper = styled.div`
  ${scheduleInset};
  padding: 0.9rem;
  overflow-x: auto;
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

const Slot = styled.div<{ $isSelected: boolean; $isEnabled: boolean }>`
  height: 2.9rem;
  width: 100%;
  border-radius: 0.95rem;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease,
    background-color 0.12s ease;
  position: relative;

  ${(props) =>
    !props.$isEnabled
      ? css`
          background: repeating-linear-gradient(
            45deg,
            #f1e8db,
            #f1e8db 6px,
            #faf6ef 6px,
            #faf6ef 12px
          );
          border: 1px solid #e3d7c7;
          cursor: not-allowed;
        `
      : props.$isSelected
        ? css`
            background: linear-gradient(135deg, #1f7a5c 0%, #14532d 100%);
            border: 1px solid #166534;
            cursor: pointer;

            &:hover {
              transform: translateY(-1px);
              box-shadow: 0 10px 20px -16px rgba(21, 83, 45, 0.8);
            }
          `
        : css`
            background: rgba(255, 255, 255, 0.9);
            border: 1px solid #e2d8ca;
            cursor: pointer;

            &:hover {
              transform: translateY(-1px);
              box-shadow: 0 12px 18px -16px rgba(53, 42, 32, 0.4);
              border-color: #cfc2b0;
            }
          `}
`;

const Footer = styled.div`
  ${scheduleInset};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.8rem;
  flex-wrap: wrap;
`;

const FooterInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 110px;

  span {
    ${scheduleLabel};
    color: #8a7b6b;
  }

  strong {
    color: #111827;
    font-size: 1.15rem;
  }
`;

const SaveButton = styled.button`
  ${primaryAction};
  padding: 0.8rem 1.2rem;
  border-radius: 0.9rem;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
`;
