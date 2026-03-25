import { useState, useMemo, Fragment } from 'react';
import axios from 'axios';
import styled from 'styled-components';
import { ScheduleTester } from './ScheduleTester';
import type { Candidate, Interviewer, ScheduleItem } from '../types';

interface ScheduleTestingViewProps {
  candidates: Candidate[];
  interviewers: Interviewer[];
}

interface SolveResponse {
  status: 'SUCCESS' | 'INFEASIBLE';
  schedule: ScheduleItem[];
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ScheduleTestingView({ candidates, interviewers }: ScheduleTestingViewProps) {
  const [panelSize, setPanelSize] = useState(3);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SolveResponse | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'config' | 'results' | 'visual'>('config');

  const [interviewerAvailability, setInterviewerAvailability] = useState<Record<string, Set<string>>>(
    () => {
      const initial: Record<string, Set<string>> = {};
      interviewers.forEach((i) => { initial[i.id] = new Set(); });
      return initial;
    }
  );

  const [selectedInterviewer, setSelectedInterviewer] = useState<string | null>(
    interviewers[0]?.id ?? null
  );

  const slotsToAvailability = (slots: Set<string>): number[] => {
    return Array.from(slots).map((slot) => {
      const [day, hour] = slot.split('-').map(Number);
      return day * 24 + hour;
    });
  };

  const handleSolve = async () => {
    if (candidates.length === 0 || interviewers.length === 0) {
      setError('You need at least one candidate and one interviewer.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const updatedInterviewers = interviewers.map((interviewer) => ({
        ...interviewer,
        availability: slotsToAvailability(interviewerAvailability[interviewer.id] || new Set()),
      }));

      const payload = {
        candidates,
        interviewers: updatedInterviewers,
        panel_size: panelSize,
      };

      // Ensure your backend URL is correct or configurable
      const response = await axios.post('http://localhost:8000/solve', payload);
      setResult(response.data);
      if (response.data.status === 'SUCCESS') {
        setActiveTab('results');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to connect to the solver. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  const scheduleByTime = useMemo(() => {
    if (!result?.schedule) return new Map<string, ScheduleItem>();
    const map = new Map<string, ScheduleItem>();
    result.schedule.forEach((item) => {
      const day = Math.floor(item.time / 24);
      const hour = item.time % 24;
      map.set(`${day}-${hour}`, item);
    });
    return map;
  }, [result]);

  const formatHour = (hour: number) => {
    const displayHour = hour % 12 || 12;
    return `${displayHour}${hour >= 12 ? 'pm' : 'am'}`;
  };

  return (
    <PageWrapper>
      {/* Header */}
      <Header>
        <div>
          <PageTitle>Planleggings-optimaliserer</PageTitle>
        </div>

        <StatGroup>
          <StatItem>
            <StatValue>{candidates.length}</StatValue>
            <StatLabel>Kandidater</StatLabel>
          </StatItem>
          <StatItem>
            <StatValue>{interviewers.length}</StatValue>
            <StatLabel>Intervjuere</StatLabel>
          </StatItem>
        </StatGroup>
      </Header>

      {/* Tabs */}
      <Tabs>
        <Tab
            $active={activeTab === 'config'}
            onClick={() => setActiveTab('config')}
        >
            Oppsett
        </Tab>
        <Tab
            $active={activeTab === 'results'}
            onClick={() => setActiveTab('results')}
        >
            Resultat
        </Tab>
        <Tab
            $active={activeTab === 'visual'}
            onClick={() => setActiveTab('visual')}
        >
            Timeline
        </Tab>
      </Tabs>

      <ContentArea>
        {activeTab === 'config' && (
          <ConfigGrid>
            <Sidebar>
              <div>
                <Label>Antall intervjuere</Label>
                <ButtonGroup>
                  {[2, 3, 4, 5].map((size) => (
                    <NumberButton
                      key={size}
                      onClick={() => setPanelSize(size)}
                      $isActive={panelSize === size}
                    >
                      {size}
                    </NumberButton>
                  ))}
                </ButtonGroup>
              </div>

              <PrimaryButton onClick={handleSolve} disabled={loading}>
                {loading ? 'Prosesserer...' : 'Lag plan'}
              </PrimaryButton>

              {error && <ErrorBox>{error}</ErrorBox>}
            </Sidebar>

            <MainConfig>
               <SectionHeader>
                   <h3>Tilgjengelighet</h3>
                   <ButtonGroup>
                      {interviewers.map((interviewer) => (
                        <FilterButton
                          key={interviewer.id}
                          onClick={() => setSelectedInterviewer(interviewer.id)}
                          $isActive={selectedInterviewer === interviewer.id}
                        >
                          {interviewer.name}
                        </FilterButton>
                      ))}
                   </ButtonGroup>
               </SectionHeader>

              {selectedInterviewer && (
                <ScheduleTester
                  key={selectedInterviewer}
                  title={`${interviewers.find((i) => i.id === selectedInterviewer)?.name}`}
                  selectedSlots={interviewerAvailability[selectedInterviewer]}
                  onSlotsChange={(slots) => {
                    setInterviewerAvailability((prev) => ({
                      ...prev,
                      [selectedInterviewer]: slots,
                    }));
                  }}
                />
              )}
            </MainConfig>
          </ConfigGrid>
        )}

        {activeTab === 'results' && (
          <ResultContainer>
            {result?.status === 'SUCCESS' ? (
              <ResultsList>
                 {result.schedule
                    .sort((a, b) => a.time - b.time)
                    .map((item, idx) => (
                      const dayIndex = Math.floor(item.time / 24);
                      const hour = item.time%24;
                      const dayName = DAYS[dayIndex];
                      <ResultItem key={idx}>
                         <TimeCol>
                            <TdTime>{dayName} {hour}:00</TdTime>
                         </TimeCol>
                         <CandidateCol>{item.candidate}</CandidateCol>
                         <PanelTags>
                            {item.panel.map((p, i) => (
                              <Badge key={i}>{p}</Badge>
                            ))}
                         </PanelTags>
                      </ResultItem>
                 ))}
              </ResultsList>
            ) : (
              <EmptyState>No results generated</EmptyState>
            )}
          </ResultContainer>
        )}

        {activeTab === 'visual' && (
             <VisualContainer>
                <VisualGrid>
                   <div className="header-row">
                      <div className="time-label">Time</div>
                      {DAYS.map(d => <div key={d} className="day-label">{d}</div>)}
                   </div>
                   {Array.from({ length: 10 }, (_, i) => i + 8).map(hour => (
                      <div key={hour} className="row">
                         <div className="time-label">{formatHour(hour)}</div>
                         {DAYS.map((_, dayIdx) => {
                           const slot = scheduleByTime.get(`${dayIdx}-${hour}`)
                           return (
                             <div key={dayIdx} className="cell">
                                {slot && (
                                  <SlotCard>
                                     <strong>{slot.candidate}</strong>
                                     <span>{slot.panel.length} interviewers</span>
                                  </SlotCard>
                                )}
                             </div>
                           )
                         })}
                      </div>
                   ))}
                </VisualGrid>
             </VisualContainer>
        )}
      </ContentArea>
    </PageWrapper>
  );
}

export default ScheduleTestingView;

// --- Styles ---

const PageWrapper = styled.div`
  max-width: var(--lego-max-width);
  margin: 0 auto;
  padding: var(--spacing-xl) 0;
`;

const Header = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-gray);
  padding-bottom: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);
`;

const PageTitle = styled.h1`
  font-size: var(--font-size-xl);
  font-weight: bold;
  color: var(--lego-font-color);
  margin: 0;
`;

const StatGroup = styled.div`
  display: flex;
  gap: var(--spacing-xl);
  text-align: right;
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
`;

const StatValue = styled.div`
  font-size: var(--font-size-xl);
  font-weight: 300;
  line-height: 1;
`;

const StatLabel = styled.div`
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  color: var(--color-gray-5);
  margin-top: 4px;
`;

const Tabs = styled.div`
  display: flex;
  gap: var(--spacing-lg);
  border-bottom: 1px solid var(--border-gray);
  margin-bottom: var(--spacing-xl);
`;

const Tab = styled.button<{ $active: boolean }>`
  background: none;
  border: none;
  padding-bottom: var(--spacing-md);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  position: relative;
  transition: color var(--easing-fast);
  color: ${props => props.$active ? 'var(--lego-font-color)' : 'var(--color-gray-5)'};

  &:hover {
    color: var(--lego-font-color);
  }

  /* Active underline */
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 2px;
    background: var(--lego-font-color);
    transform: ${props => props.$active ? 'scaleX(1)' : 'scaleX(0)'};
    transition: transform var(--easing-fast);
  }
`;

const ContentArea = styled.div`
  min-height: 400px;
`;

const ConfigGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: var(--spacing-xl);

  @media (max-width: 768px) {
      grid-template-columns: 1fr;
  }
`;

const Sidebar = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xl);
`;

const MainConfig = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
`;

const SectionHeader = styled.div`
  text-align: center;
  
  h3 {
    margin-bottom: var(--spacing-md);
  }
`;

const Label = styled.div`
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  color: var(--color-gray-5);
  margin-bottom: var(--spacing-sm);
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
  justify-content: center;
`;

const NumberButton = styled.button<{ $isActive: boolean }>`
  width: 3rem;
  height: 3rem;
  border: 1px solid;
  border-radius: var(--border-radius-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--easing-fast);

  background: ${props => props.$isActive ? 'var(--lego-font-color)' : 'var(--lego-card-color)'};
  color: ${props => props.$isActive ? 'var(--color-white)' : 'var(--color-gray-5)'};
  border-color: ${props => props.$isActive ? 'var(--lego-font-color)' : 'var(--border-gray)'};
`;

const FilterButton = styled.button<{ $isActive: boolean }>`
  padding: 6px 12px;
  border-radius: var(--border-radius-sm);
  font-size: var(--font-size-xs);
  border: 1px solid;
  cursor: pointer;
  transition: all var(--easing-fast);

  background: ${props => props.$isActive ? 'var(--color-gray-1)' : 'var(--lego-card-color)'};
  color: ${props => props.$isActive ? 'var(--lego-font-color)' : 'var(--color-gray-5)'};
  border-color: ${props => props.$isActive ? 'var(--color-gray-4)' : 'var(--border-gray)'};
`;

const PrimaryButton = styled.button`
  width: 100%;
  padding: var(--spacing-md);
  background: var(--lego-font-color);
  color: var(--color-white);
  border: none;
  border-radius: var(--border-radius-sm);
  font-weight: 500;
  cursor: pointer;
  transition: opacity var(--easing-fast);

  &:hover {
    opacity: 0.9;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ErrorBox = styled.div`
  padding: var(--spacing-md);
  background: var(--color-red-1);
  color: var(--color-red-7);
  font-size: var(--font-size-xs);
  border: 1px solid var(--color-red-2);
  border-radius: var(--border-radius-sm);
`;

const ResultContainer = styled.div`
  max-width: 600px;
`;

const ResultsList = styled.div`
  border: 1px solid var(--border-gray);
  border-radius: var(--border-radius-md);
  overflow: hidden;
`;

const ResultItem = styled.div`
  display: flex;
  align-items: center;
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--border-gray);
  background: var(--lego-card-color);

  &:last-child {
    border-bottom: none;
  }
`;

const TimeCol = styled.div`
  width: 100px;
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-gray-5);

  span {
    color: var(--lego-font-color);
  }
`;

const CandidateCol = styled.div`
  flex: 1;
  font-weight: 600;
  color: var(--lego-font-color);
`;

const PanelTags = styled.div`
  display: flex;
  gap: var(--spacing-xs);
`;

const Badge = styled.span`
  background: var(--color-gray-1);
  color: var(--color-gray-7);
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: var(--border-radius-sm);
`;

const EmptyState = styled.div`
  text-align: center;
  padding: var(--spacing-xl);
  color: var(--color-gray-4);
`;

const VisualContainer = styled.div`
  overflow-x: auto;
  border: 1px solid var(--border-gray);
  border-radius: var(--border-radius-md);
`;

const VisualGrid = styled.div`
  min-width: 800px;
  
  .header-row, .row {
    display: grid;
    grid-template-columns: 80px repeat(7, 1fr);
  }

  .header-row {
    background: var(--color-gray-1);
    border-bottom: 1px solid var(--border-gray);
  }
  
  .row {
    border-bottom: 1px solid var(--border-gray);
    &:last-child { border-bottom: none; }
  }

  .time-label {
    padding: var(--spacing-sm);
    font-size: 10px;
    color: var(--color-gray-5);
    border-right: 1px solid var(--border-gray);
    text-align: right;
  }

  .day-label {
    padding: var(--spacing-sm);
    font-size: 10px;
    font-weight: bold;
    text-align: center;
    color: var(--color-gray-7);
  }

  .cell {
    padding: 2px;
    min-height: 48px;
  }
`;

const SlotCard = styled.div`
  height: 100%;
  background: var(--lego-font-color);
  color: var(--color-white);
  border-radius: var(--border-radius-sm);
  padding: 4px 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  font-size: var(--font-size-xs);

  span {
    font-size: 10px;
    opacity: 0.7;
  }
`;
