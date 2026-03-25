import * as React from "react";
import styled, { css } from "styled-components";

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
}

const TimeScheduler: React.FC<TimeSchedulerProps> = ({
  enabledSlots,
  selectedSlots: externalSelectedSlots,
  onSlotsChange,
  startHour = 8,
  endHour = 16,
  onSave,
}) => {
  const [internalSelectedSlots, setInternalSelectedSlots] = React.useState<
    Set<string>
  >(new Set());
  const selectedSlots = externalSelectedSlots ?? internalSelectedSlots;
  const setSelectedSlots = onSlotsChange ?? setInternalSelectedSlots;

  const [isDragging, setIsDragging] = React.useState(false);
  const [addMode, setAddMode] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const HOURS = React.useMemo(
    () =>
      Array.from(
        { length: endHour - startHour },
        (_, i) => `${i + startHour}:00`,
      ),
    [startHour, endHour],
  );

  const isSlotEnabled = (dayIndex: number, hour: number): boolean => {
    if (!enabledSlots) return true;
    return enabledSlots.has(`${dayIndex}-${hour}`);
  };

  const toggleSlot = React.useCallback(
    (
      dayIndex: number,
      hour: number,
      mode: boolean,
      currentSlots: Set<string>,
    ) => {
      if (!isSlotEnabled(dayIndex, hour)) return;

      const slotId = `${dayIndex}-${hour}`;
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

  const handleMouseDown = (dayIndex: number, hour: number) => {
    if (!isSlotEnabled(dayIndex, hour)) return;

    const slotId = `${dayIndex}-${hour}`;
    const newAddMode = !selectedSlots.has(slotId);

    setAddMode(newAddMode);
    setIsDragging(true);
    toggleSlot(dayIndex, hour, newAddMode, selectedSlots);
  };

  const handleMouseEnter = (dayIndex: number, hour: number) => {
    if (isDragging && isSlotEnabled(dayIndex, hour)) {
      toggleSlot(dayIndex, hour, addMode, selectedSlots);
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
      <Grid>
        <div />

        {DAYS.map((day) => (
          <HeaderCell key={day}>{day}</HeaderCell>
        ))}

        {HOURS.map((hourLabel) => {
          const hour = parseInt(hourLabel);
          return (
            <React.Fragment key={hourLabel}>
              <TimeLabel>{hourLabel}</TimeLabel>

              {DAYS.map((day, dayIndex) => {
                const enabled = isSlotEnabled(dayIndex, hour);
                const isSelected = selectedSlots.has(`${dayIndex}-${hour}`);

                return (
                  <Slot
                    key={`${dayIndex}-${hour}`}
                    onMouseDown={() => handleMouseDown(dayIndex, hour)}
                    onMouseEnter={() => handleMouseEnter(dayIndex, hour)}
                    $isSelected={isSelected}
                    $isEnabled={enabled}
                  />
                );
              })}
            </React.Fragment>
          );
        })}
      </Grid>

      <Footer>
        <FooterInfo>
          <strong>{selectedSlots.size}</strong> tidsluker valgt
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
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  user-select: none;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 50px repeat(7, 1fr);
  gap: 4px;
  background-color: var(--border-gray);
  padding: 1px;
  border-radius: var(--border-radius-sm);
  overflow: hidden;
`;

const HeaderCell = styled.div`
  background-color: var(--lego-card-color);
  font-size: var(--font-size-xs);
  font-weight: 600;
  text-align: center;
  color: var(--color-gray-6);
  padding: 0.75rem 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.025em;
`;

const TimeLabel = styled.div`
  background-color: var(--lego-card-color);
  font-size: 11px;
  font-weight: 500;
  color: var(--color-gray-5);
  text-align: right;
  padding-right: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: flex-end;
`;

const Slot = styled.div<{ $isSelected: boolean; $isEnabled: boolean }>`
  height: 2.25rem;
  width: 100%;
  transition: all 0.1s ease-in-out;
  position: relative;

  ${(props) =>
    !props.$isEnabled
      ? css`
          background-color: var(--lego-background-color);
          cursor: not-allowed;
          background-image: repeating-linear-gradient(
            45deg,
            transparent,
            transparent 5px,
            rgba(0, 0, 0, 0.02) 5px,
            rgba(0, 0, 0, 0.02) 10px
          );
        `
      : props.$isSelected
        ? css`
            background-color: var(--success-color);
            cursor: pointer;

            &:hover {
              background-color: var(--color-green-5);
              transform: scale(0.98);
            }

            &::after {
              content: "";
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              border: 1px solid rgba(0, 0, 0, 0.05);
            }
          `
        : css`
            background-color: var(--lego-card-color);
            cursor: pointer;

            &:hover {
              background-color: var(--color-gray-1);
              z-index: 1;
              box-shadow: inset 0 0 0 2px var(--color-gray-2);
            }
          `}
`;

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 0.5rem;
`;

const FooterInfo = styled.div`
  font-size: var(--font-size-sm);
  color: var(--color-gray-6);

  strong {
    color: var(--lego-font-color);
    font-weight: 700;
  }
`;

const SaveButton = styled.button`
  padding: 0.6rem 1.5rem;
  font-size: var(--font-size-sm);
  font-weight: 600;
  background: var(--lego-font-color);
  border: none;
  border-radius: var(--border-radius-sm);
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
    background: var(--color-black);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }
`;
