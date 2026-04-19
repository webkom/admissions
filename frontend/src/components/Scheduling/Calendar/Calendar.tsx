import * as React from "react";
import styled, { css } from "styled-components";
import {
  primaryAction,
  scheduleGridHeaderCell,
  scheduleGridShell,
  scheduleGridTimeLabel,
  scheduleInset,
  scheduleLabel,
  scheduleSurface,
} from "../shared";
import { formatDateHeader, makeSlotKey } from "../scheduleUtils";

interface TimeSchedulerProps {
  enabledSlots?: Set<string>;
  selectedSlots?: Set<string>;
  onSlotsChange?: (slots: Set<string>) => void;
  startHour?: number;
  endHour?: number;
  onSave?: (slots: Set<string>) => Promise<void>;
  sessionDuration: number;
  dates: string[];
}

const TimeScheduler: React.FC<TimeSchedulerProps> = ({
  enabledSlots,
  selectedSlots: externalSelectedSlots,
  onSlotsChange,
  startHour = 8,
  endHour = 18,
  onSave,
  sessionDuration,
  dates,
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

  const isSlotEnabled = (date: string, minute: number): boolean => {
    if (!enabledSlots) return true;
    return enabledSlots.has(makeSlotKey(date, minute));
  };

  const toggleSlot = React.useCallback(
    (date: string, minute: number, mode: boolean, currentSlots: Set<string>) => {
      if (!enabledSlots || !enabledSlots.has(makeSlotKey(date, minute))) return;

      const slotId = makeSlotKey(date, minute);
      const next = new Set(currentSlots);
      if (mode) next.add(slotId);
      else next.delete(slotId);
      setSelectedSlots(next);
    },
    [enabledSlots, setSelectedSlots],
  );

  const handleMouseDown = (date: string, minute: number) => {
    if (!isSlotEnabled(date, minute)) return;
    const slotId = makeSlotKey(date, minute);
    const newAddMode = !selectedSlots.has(slotId);
    setAddMode(newAddMode);
    setIsDragging(true);
    toggleSlot(date, minute, newAddMode, selectedSlots);
  };

  const handleMouseEnter = (date: string, minute: number) => {
    if (isDragging && isSlotEnabled(date, minute)) {
      toggleSlot(date, minute, addMode, selectedSlots);
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
        <Title>Marker tilgjengelige slots</Title>
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
                const isSelected = selectedSlots.has(makeSlotKey(date, minute));

                return (
                  <Slot
                    key={makeSlotKey(date, minute)}
                    onMouseDown={() => handleMouseDown(date, minute)}
                    onMouseEnter={() => handleMouseEnter(date, minute)}
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
          <span>Valgte slots</span>
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
  min-width: 0;
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const Title = styled.h3`
  margin: 0;
  color: #111111;
  font-size: 0.875rem;
  font-weight: 700;
`;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
`;

const LegendItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  background: #f5f5f5;
  border: 1px solid #e4e4e4;
  color: #6b6b6b;
  font-size: 0.75rem;
  font-weight: 600;
`;

const LegendDot = styled.span<{ $variant: "selected" | "open" | "disabled" }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;

  ${(props) =>
    props.$variant === "selected"
      ? css`
          background: var(--lego-red-color);
        `
      : props.$variant === "open"
        ? css`
            background: #ffffff;
            border: 1px solid #c8c8c8;
          `
        : css`
            background: #e4e4e4;
          `}
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

const Slot = styled.div<{ $isSelected: boolean; $isEnabled: boolean }>`
  height: 2.5rem;
  width: 100%;
  border-radius: 6px;
  transition: background-color 0.1s ease, border-color 0.1s ease;
  cursor: pointer;

  ${(props) =>
    !props.$isEnabled
      ? css`
          background: #f0f0f0;
          border: 1px solid #e4e4e4;
          cursor: not-allowed;
        `
      : props.$isSelected
        ? css`
            background: var(--lego-red-color);
            border: 1px solid var(--lego-red-color);

            &:hover {
              background: #9a1006;
            }
          `
        : css`
            background: #ffffff;
            border: 1px solid #e4e4e4;

            &:hover {
              border-color: rgba(178, 18, 7, 0.3);
              background: rgba(178, 18, 7, 0.03);
            }
          `}
`;

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #e4e4e4;
  flex-wrap: wrap;
`;

const FooterInfo = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;

  span {
    ${scheduleLabel};
  }

  strong {
    color: #111111;
    font-size: 0.875rem;
    font-weight: 700;
  }
`;

const SaveButton = styled.button`
  ${primaryAction};
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  font-size: 0.813rem;
  font-weight: 700;
  cursor: pointer;
`;
