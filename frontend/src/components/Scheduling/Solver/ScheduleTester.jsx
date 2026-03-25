import { useState, useCallback, useRef, useEffect, Fragment } from 'react';
import styled from 'styled-components';

interface ScheduleTesterProps {
  selectedSlots?: Set<string>;
  onSlotsChange?: (slots: Set<string>) => void;
  startHour?: number;
  endHour?: number;
  title?: string;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ScheduleTester({
  selectedSlots: externalSelectedSlots,
  onSlotsChange,
  startHour = 8,
  endHour = 18,
  title,
}: ScheduleTesterProps) {
  // ... (Keep your existing state logic exactly as it was) ...
  const [internalSelectedSlots, setInternalSelectedSlots] = useState<Set<string>>(new Set());
  const selectedSlots = externalSelectedSlots ?? internalSelectedSlots;
  const setSelectedSlots = onSlotsChange ?? setInternalSelectedSlots;

  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'select' | 'deselect'>('select');
  const [dragStart, setDragStart] = useState<{day: number, hour: number} | null>(null);
  const [previewSlots, setPreviewSlots] = useState<Set<string>>(new Set());

  const HOURS = Array.from({ length: endHour - startHour }, (_, i) => i + startHour);
  const slotKey = (day: number, hour: number) => `${day}-${hour}`;

  // ... (Keep helper functions: getSlotsInRange, handleMouseDown, handleMouseEnter, handleMouseUp) ...
  // For brevity, I'm skipping the logic copy-paste, assuming you keep the functions you wrote.
  // Ensure you include getSlotsInRange, handleMouseDown, etc. here.

  const getSlotsInRange = (start: {day: number, hour: number}, end: {day: number, hour: number}): Set<string> => {
      const slots = new Set<string>()
      const minDay = Math.min(start.day, end.day)
      const maxDay = Math.max(start.day, end.day)
      const minHour = Math.min(start.hour, end.hour)
      const maxHour = Math.max(start.hour, end.hour)

      for (let d = minDay; d <= maxDay; d++) {
        for (let h = minHour; h <= maxHour; h++) {
          slots.add(slotKey(d, h))
        }
      }
      return slots
  }

  const handleMouseDown = (day: number, hour: number) => {
    const key = slotKey(day, hour)
    const isSelected = selectedSlots.has(key)
    setIsDragging(true)
    setDragMode(isSelected ? 'deselect' : 'select')
    setDragStart({ day, hour })
    setPreviewSlots(new Set([key]))
  }

  const handleMouseEnter = (day: number, hour: number) => {
    if (!isDragging || !dragStart) return
    const currentSlot = { day, hour }
    const slotsInRange = getSlotsInRange(dragStart, currentSlot)
    setPreviewSlots(slotsInRange)
  }

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return
    const newSet = new Set(selectedSlots)
    previewSlots.forEach((slot) => {
      if (dragMode === 'select') newSet.add(slot)
      else newSet.delete(slot)
    })
    setSelectedSlots(newSet)
    setIsDragging(false)
    setDragStart(null)
    setPreviewSlots(new Set())
  }, [isDragging, previewSlots, dragMode, selectedSlots, setSelectedSlots])

  useEffect(() => {
    const handleGlobalMouseUp = () => handleMouseUp()
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [handleMouseUp])

  const formatHour = (hour: number) => {
    const period = hour >= 12 ? 'pm' : 'am'
    const displayHour = hour % 12 || 12
    return `${displayHour}${period}`;
  };

  return (
    <Container>
      <Header>
         {title && <Title>{title}</Title>}
         <Actions>
            <ActionButton onClick={() => setSelectedSlots(new Set())}>
                Tøm
            </ActionButton>
            <ActionButton
               $primary
               onClick={() => {
                  const workSlots = new Set<string>()
                  for (let d = 0; d < 5; d++) {
                    for (let h = 9; h < 17; h++) {
                      if (h >= startHour && h < endHour) workSlots.add(slotKey(d, h))
                    }
                  }
                  setSelectedSlots(workSlots)
               }}
            >
               Mandag - Fredag
            </ActionButton>
         </Actions>
      </Header>

      <ScrollContainer>
        <Grid>
          <div /> {/* Empty top-left corner */}

          {DAYS.map((day) => (
            <DayHeader key={day}>{day}</DayHeader>
          ))}

          {HOURS.map((hour) => (
            <Fragment key={hour}>
              <HourLabel>{formatHour(hour)}</HourLabel>
              {DAYS.map((_, dayIndex) => {
                const key = slotKey(dayIndex, hour);
                const isSelected = selectedSlots.has(key);
                const isPreview = previewSlots.has(key);

                return (
                  <Cell
                    key={key}
                    onMouseDown={() => handleMouseDown(dayIndex, hour)}
                    onMouseEnter={() => handleMouseEnter(dayIndex, hour)}
                    $isSelected={isSelected}
                    $isPreview={isPreview}
                    $dragMode={dragMode}
                  />
                );
              })}
            </Fragment>
          ))}
        </Grid>
      </ScrollContainer>
    </Container>
  );
}

export default ScheduleTester;

// --- Styles ---

const Container = styled.div`
  background: var(--lego-card-color);
  border: 1px solid var(--border-gray);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
  user-select: none;
`;

const Header = styled.div`
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--border-gray);
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h2`
  font-size: var(--font-size-sm);
  font-weight: bold;
  color: var(--lego-font-color);
  margin: 0;
`;

const Actions = styled.div`
  display: flex;
  gap: var(--spacing-sm);
`;

const ActionButton = styled.button<{ $primary?: boolean }>`
  font-size: 10px;
  text-transform: uppercase;
  font-weight: bold;
  letter-spacing: 0.05em;
  padding: 4px 8px;
  border-radius: var(--border-radius-sm);
  border: none;
  cursor: pointer;
  transition: all var(--easing-fast);

  /* Conditional Styling */
  background: ${props => props.$primary ? 'var(--color-gray-2)' : 'transparent'};
  color: ${props => props.$primary ? 'var(--color-gray-7)' : 'var(--color-gray-5)'};

  &:hover {
    color: var(--color-gray-9);
    background: ${props => props.$primary ? 'var(--color-gray-3)' : 'transparent'};
  }
`;

const ScrollContainer = styled.div`
  padding: var(--spacing-md);
  overflow-x: auto;
`;

const Grid = styled.div`
  display: inline-grid;
  /* 8 columns: 1 for time labels, 7 for days */
  grid-template-columns: 40px repeat(7, minmax(40px, 1fr));
  gap: 1px;
  background: var(--color-gray-2); /* Gap color */
  border: 1px solid var(--color-gray-2);
  border-radius: var(--border-radius-sm);
  min-width: 100%;
`;

const DayHeader = styled.div`
  background: var(--lego-card-color);
  padding: var(--spacing-sm) 0;
  text-align: center;
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  color: var(--color-gray-5);
`;

const HourLabel = styled.div`
  background: var(--lego-card-color);
  padding: 4px 8px;
  font-size: 10px;
  font-family: monospace;
  color: var(--color-gray-4);
  display: flex;
  align-items: center;
  justify-content: flex-end;
`;

interface CellProps {
  $isSelected: boolean;
  $isPreview: boolean;
  $dragMode: 'select' | 'deselect';
}

const Cell = styled.div<CellProps>`
  height: 2rem;
  cursor: pointer;
  background-color: var(--lego-card-color);
  transition: background-color 75ms;

  ${props => {
    if (props.$isSelected) return `background-color: var(--color-gray-9);`; // Selected = Black
    if (props.$isPreview) {
        return props.$dragMode === 'select' 
          ? `background-color: var(--color-gray-3);` // Dragging select = Gray
          : `background-color: var(--color-red-1);`; // Dragging deselect = Red tint
    }
    return `&:hover { background-color: var(--color-gray-1); }`; // Default hover
  }}
`;
