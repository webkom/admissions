import React, { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import styled, { css } from "styled-components";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarRange,
  LayoutPanelTop,
  Sparkles,
  CalendarCheck,
} from "lucide-react";
import { useAdmission, useSavedSchedule } from "src/query/hooks";
import { media } from "src/styles/mediaQueries";
import {
  primaryAction,
  scheduleLabel,
  scheduleInput,
  scheduleSurface,
} from "src/components/Scheduling/shared";
import { Group, Candidate, Interviewer, SavedSchedule } from "../../types";
import TimeScheduler from "src/components/Scheduling/Calendar/Calendar";
import PersonListView from "src/components/Scheduling/PersonList/PersonListView";
import SolverView from "src/components/Scheduling/Solver/SolverView";
import AvailabilityHeatmap from "src/components/Scheduling/Calendar/AvailabilityHeatmap";
import AdminScheduleConfig from "src/components/Scheduling/Calendar/AdminScheduleConfig";
import {
  DEFAULT_MOCK_CANDIDATE_COUNT,
  DEFAULT_MOCK_INTERVIEWER_COUNT,
  createMockCandidates,
  createMockInterviewers,
} from "./mockData";
import {
  addDays,
  dateRangeDates,
  formatDateHeader,
  generateIcs,
  makeSlotKey,
  nextMonday,
  parseSlotKey,
} from "src/components/Scheduling/scheduleUtils";

const SchedulePage: React.FC = () => {
  const { admissionSlug } = useParams();
  const { data: admission } = useAdmission(admissionSlug ?? "");

  if (!admission) {
    return <div>Loading...</div>;
  }

  const { is_privileged, committee_groups } = admission.userdata;
  const groupsToShow = committee_groups ?? [];

  return (
    <CommonScheduleView
      admissionTitle={admission.title}
      admissionSlug={admissionSlug ?? ""}
      committees={groupsToShow}
      isAdmin={is_privileged}
    />
  );
};

interface CommonScheduleViewProps {
  admissionTitle: string;
  admissionSlug: string;
  committees: Group[];
  isAdmin: boolean;
}

type TabType = "my-availability" | "heatmap" | "config" | "solver" | "plan";

interface TabDefinition {
  key: TabType;
  title: string;
  description: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const CommonScheduleView: React.FC<CommonScheduleViewProps> = ({
  admissionTitle,
  admissionSlug,
  committees,
  isAdmin,
}) => {
  const { data: savedSchedule } = useSavedSchedule(admissionSlug);
  const [activeSection, setActiveSection] =
    useState<TabType>("my-availability");

  const defaultStart = useMemo(() => nextMonday(), []);
  const defaultEnd = useMemo(() => addDays(defaultStart, 4), [defaultStart]);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  const dates = useMemo(
    () => dateRangeDates(startDate, endDate),
    [startDate, endDate],
  );

  const [enabledSlots, setEnabledSlots] = useState<Set<string>>(() => {
    const slots = new Set<string>();
    const initDates = dateRangeDates(defaultStart, addDays(defaultStart, 4));
    initDates.forEach((date) => {
      for (let hour = 8; hour < 17; hour++) {
        slots.add(makeSlotKey(date, hour * 60));
      }
    });
    return slots;
  });

  const handleDateRangeChange = (start: string, end: string) => {
    const newDates = new Set(dateRangeDates(start, end));
    const cleaned = new Set<string>();
    enabledSlots.forEach((key) => {
      const { date } = parseSlotKey(key);
      if (newDates.has(date)) cleaned.add(key);
    });
    setEnabledSlots(cleaned);
    setStartDate(start);
    setEndDate(end);
  };

  const [candidateCount, setCandidateCount] = useState(
    DEFAULT_MOCK_CANDIDATE_COUNT,
  );
  const [interviewerCount, setInterviewerCount] = useState(
    DEFAULT_MOCK_INTERVIEWER_COUNT,
  );
  const [candidateInput, setCandidateInput] = useState(
    String(DEFAULT_MOCK_CANDIDATE_COUNT),
  );
  const [interviewerInput, setInterviewerInput] = useState(
    String(DEFAULT_MOCK_INTERVIEWER_COUNT),
  );
  const candidates = useMemo<Candidate[]>(
    () => createMockCandidates(candidateCount),
    [candidateCount],
  );
  const interviewers = useMemo<Interviewer[]>(
    () => createMockInterviewers(interviewerCount),
    [interviewerCount],
  );
  const [sessionDuration, setSessionDuration] = useState<number>(60);

  const handleSaveConfig = async () => {
    console.log("Saving config:", { startDate, endDate, slots: Array.from(enabledSlots) });
    await new Promise((resolve) => setTimeout(resolve, 500));
    alert("Konfigurasjon lagret!");
  };
  const parsedCandidateInput = Number(candidateInput);
  const parsedInterviewerInput = Number(interviewerInput);
  const isCandidateInputValid =
    Number.isInteger(parsedCandidateInput) &&
    parsedCandidateInput >= 1 &&
    parsedCandidateInput <= 200;
  const isInterviewerInputValid =
    Number.isInteger(parsedInterviewerInput) &&
    parsedInterviewerInput >= 1 &&
    parsedInterviewerInput <= 200;
  const hasPendingScaleChanges =
    candidateInput !== String(candidateCount) ||
    interviewerInput !== String(interviewerCount);
  const hasValidScaleInput =
    isCandidateInputValid && isInterviewerInputValid;

  const handleSaveScale = () => {
    if (!hasValidScaleInput || !hasPendingScaleChanges) return;

    setCandidateCount(parsedCandidateInput);
    setInterviewerCount(parsedInterviewerInput);
  };

  const tabDefinitions = useMemo<TabDefinition[]>(() => {
    const tabs: TabDefinition[] = [
      {
        key: "plan",
        title: "Intervjuplan",
        description: "Se den distribuerte intervjuplanen.",
        icon: CalendarCheck,
      },
      {
        key: "config",
        title: "Rammer",
        description: "Sett hvilke slotter og hvilken varighet som gjelder.",
        icon: LayoutPanelTop,
        adminOnly: true,
      },
      {
        key: "my-availability",
        title: "Min tilgjengelighet",
        description: "Marker når du faktisk kan sitte i intervju.",
        icon: CalendarRange,
      },
      {
        key: "heatmap",
        title: "Fordeling",
        description: "Se dekning og kandidatlisten i samme arbeidsflate.",
        icon: BarChart3,
      },
      {
        key: "solver",
        title: "Intervjuforslag",
        description: "Generer et forslag når datagrunnlaget er klart.",
        icon: Sparkles,
        adminOnly: true,
      },
    ];

    return tabs.filter((tab) => !tab.adminOnly || isAdmin);
  }, [isAdmin]);

  return (
    <PageBackground>
      <PageContainer>
        <HeaderBlock>
          <HeaderRow>
            <Title>{admissionTitle}</Title>
            <RolePill $admin={isAdmin}>
              {isAdmin ? "Admin" : "Intervjuer"}
            </RolePill>
          </HeaderRow>
        </HeaderBlock>

        {isAdmin && (
          <ScaleCard>
            <ScaleHeader>
              <ScaleTitle>Testdata</ScaleTitle>
              <ScaleHint>
                Skru opp antall kandidater og intervjuere for å stressteste
                planleggingen.
              </ScaleHint>
            </ScaleHeader>

            <ScaleControls>
              <ScaleField>
                <ScaleLabel htmlFor="candidate-count">Kandidater</ScaleLabel>
                <ScaleInput
                  id="candidate-count"
                  type="number"
                  min="1"
                  max="200"
                  value={candidateInput}
                  onChange={(event) => setCandidateInput(event.target.value)}
                />
              </ScaleField>

              <ScaleField>
                <ScaleLabel htmlFor="interviewer-count">
                  Intervjuere
                </ScaleLabel>
                <ScaleInput
                  id="interviewer-count"
                  type="number"
                  min="1"
                  max="200"
                  value={interviewerInput}
                  onChange={(event) => setInterviewerInput(event.target.value)}
                />
              </ScaleField>

              <ScaleSaveButton
                type="button"
                onClick={handleSaveScale}
                disabled={!hasValidScaleInput}
                $saved={!hasPendingScaleChanges}
              >
                {hasPendingScaleChanges ? "Lagre testdata" : "Lagret"}
              </ScaleSaveButton>
            </ScaleControls>
          </ScaleCard>
        )}

        <TabBar>
          {tabDefinitions.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabButton
                key={tab.key}
                type="button"
                $active={tab.key === activeSection}
                onClick={() => setActiveSection(tab.key)}
              >
                <Icon size={13} />
                {tab.title}
              </TabButton>
            );
          })}
        </TabBar>

        <ContentStack>
          {activeSection === "my-availability" && (
            <TimeScheduler
              enabledSlots={enabledSlots}
              dates={dates}
              sessionDuration={sessionDuration}
              onSave={async (slots) => {
                console.log("Saving availability:", Array.from(slots));
                await new Promise((resolve) => setTimeout(resolve, 500));
                alert("Tilgjengelighet lagret!");
              }}
            />
          )}

          {activeSection === "heatmap" && (
            <>
              <AvailabilityHeatmap
                interviewers={interviewers}
                availableSlots={enabledSlots}
                dates={dates}
                sessionDuration={sessionDuration}
              />

              <SubSection>
                <SubHeader>
                  <SubTitle>Kandidater</SubTitle>
                  <SubCount>{candidates.length}</SubCount>
                </SubHeader>
                <PersonListView data={candidates} />
              </SubSection>
            </>
          )}

          {activeSection === "config" && isAdmin && (
            <AdminScheduleConfig
              startDate={startDate}
              endDate={endDate}
              onDateRangeChange={handleDateRangeChange}
              enabledSlots={enabledSlots}
              onSlotsChange={setEnabledSlots}
              onSave={handleSaveConfig}
              sessionDuration={sessionDuration}
              onSessionDurationChange={setSessionDuration}
              candidateCount={candidateCount}
              interviewerCount={interviewerCount}
            />
          )}

          {activeSection === "plan" && (
            <DistributedPlanView
              savedSchedule={savedSchedule}
              dates={dates}
              isAdmin={isAdmin}
            />
          )}

          {activeSection === "solver" && isAdmin && (
            <SolverView
              candidates={candidates}
              interviewers={interviewers}
              dates={dates}
              sessionDuration={sessionDuration}
              admissionTitle={admissionTitle}
              admissionSlug={admissionSlug}
            />
          )}
        </ContentStack>
      </PageContainer>
    </PageBackground>
  );
};

interface DistributedPlanViewProps {
  savedSchedule: SavedSchedule | undefined;
  dates: string[];
  isAdmin: boolean;
}

const DistributedPlanView: React.FC<DistributedPlanViewProps> = ({
  savedSchedule,
  dates,
  isAdmin,
}) => {
  if (!savedSchedule) {
    return (
      <NoPlanCard>
        <NoPlanTitle>Ingen plan distribuert ennå</NoPlanTitle>
        <NoPlanDesc>
          {isAdmin
            ? 'Gå til "Intervjuforslag" for å generere og distribuere en intervjuplan.'
            : "Admins har ikke distribuert en intervjuplan ennå. Kom tilbake senere."}
        </NoPlanDesc>
      </NoPlanCard>
    );
  }

  const handleExport = () => {
    const icsContent = generateIcs(
      savedSchedule.schedule,
      dates,
      savedSchedule.session_duration,
      "Intervjuplan",
    );
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "intervjuplan.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const sorted = [...savedSchedule.schedule].sort((a, b) => a.time - b.time);

  return (
    <PlanCard>
      <PlanHeader>
        <PlanTitleRow>
          <PlanTitle>Intervjuplan</PlanTitle>
          {savedSchedule.is_distributed ? (
            <DistBadge>Distribuert</DistBadge>
          ) : (
            <DraftBadge>Utkast</DraftBadge>
          )}
        </PlanTitleRow>
        <ExportBtn type="button" onClick={handleExport}>
          Eksporter til kalender (.ics)
        </ExportBtn>
      </PlanHeader>

      <PlanTable>
        <thead>
          <tr>
            <PlanTh>Tidspunkt</PlanTh>
            <PlanTh>Kandidat</PlanTh>
            <PlanTh>Panel</PlanTh>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item, idx) => {
            const dayIndex = Math.floor(item.time / 24);
            const hour = item.time % 24;
            const date = dates[dayIndex];
            const timeLabel = date
              ? `${formatDateHeader(date).weekday} ${formatDateHeader(date).dayMonth} ${hour}:00`
              : `Dag ${dayIndex + 1} ${hour}:00`;
            return (
              <PlanTr key={idx}>
                <PlanTd $time>{timeLabel}</PlanTd>
                <PlanTd $bold>{item.candidate}</PlanTd>
                <PlanTd>
                  <PanelBadges>
                    {item.panel.map((p, i) => (
                      <PanelBadge key={i} $overtime={p.is_overtime}>
                        {p.name}
                      </PanelBadge>
                    ))}
                  </PanelBadges>
                </PlanTd>
              </PlanTr>
            );
          })}
        </tbody>
      </PlanTable>
    </PlanCard>
  );
};

export default SchedulePage;

const PageBackground = styled.div`
  min-height: calc(100vh - 80px);
  background: #fafafa;
`;

const PageContainer = styled.div`
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 2rem 1.25rem 3rem;

  ${media.handheld`
    padding: 1.25rem 1rem 2rem;
  `};
`;

const HeaderBlock = styled.header`
  margin-bottom: 1.5rem;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 0.3rem;
`;


const Title = styled.h1`
  margin: 0;
  color: #111111;
  font-size: clamp(1.5rem, 3.5vw, 2rem);
  line-height: 1.1;
  letter-spacing: -0.03em;
  font-weight: 700;
`;

const RolePill = styled.span<{ $admin: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: ${(props) =>
    props.$admin ? "rgba(178, 18, 7, 0.07)" : "#f0f0f0"};
  color: ${(props) => (props.$admin ? "#b21207" : "#6b6b6b")};
  border: 1px solid
    ${(props) =>
      props.$admin ? "rgba(178, 18, 7, 0.18)" : "#e4e4e4"};
`;

const TabBar = styled.nav`
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e4e4e4;
  margin-bottom: 0.75rem;
`;

const ScaleCard = styled.section`
  ${scheduleSurface};
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
`;

const ScaleHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 220px;
`;

const ScaleTitle = styled.h2`
  margin: 0;
  color: #111111;
  font-size: 0.875rem;
  font-weight: 700;
`;

const ScaleHint = styled.p`
  margin: 0;
  color: #6b6b6b;
  font-size: 0.813rem;
  line-height: 1.5;
`;

const ScaleControls = styled.div`
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const ScaleField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`;

const ScaleLabel = styled.label`
  ${scheduleLabel};
`;

const ScaleInput = styled.input`
  ${scheduleInput};
  width: 7rem;
  font-weight: 700;
`;

const ScaleSaveButton = styled.button<{ $saved: boolean }>`
  ${primaryAction};
  align-self: flex-end;
  padding: 0.55rem 1rem;
  border-radius: 8px;
  font-size: 0.813rem;
  font-weight: 700;
  cursor: pointer;

  ${(props) =>
    props.$saved &&
    `
      background: #b21207;
      border-color: #b21207;
    `}
`;

const TabButton = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.85rem;
  border-radius: 999px;
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 0.813rem;
  font-weight: 600;
  transition: all 0.12s ease;

  ${(props) =>
    props.$active
      ? css`
          color: var(--lego-red-color);
          background: rgba(178, 18, 7, 0.06);
          border-color: rgba(178, 18, 7, 0.16);
        `
      : css`
          color: #6b6b6b;
          background: transparent;

          &:hover {
            color: #111111;
            background: #f0f0f0;
            border-color: #e4e4e4;
          }
        `}
`;

const InfoRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
`;

const InfoItem = styled.span`
  ${scheduleLabel};
  color: #a0a0a0;
`;

const InfoDot = styled.span`
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #d0d0d0;
  flex-shrink: 0;
`;

const ContentStack = styled.main`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const SubSection = styled.section`
  ${scheduleSurface};
  padding: 1.25rem;
`;

const SubHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
`;

const SubTitle = styled.h3`
  margin: 0;
  color: #111111;
  font-size: 0.875rem;
  font-weight: 700;
`;

const SubCount = styled.span`
  ${scheduleLabel};
`;

const NoPlanCard = styled.div`
  ${scheduleSurface};
  padding: 3rem 1.5rem;
  text-align: center;
`;

const NoPlanTitle = styled.h3`
  margin: 0 0 0.5rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: #111111;
`;

const NoPlanDesc = styled.p`
  margin: 0;
  font-size: 0.813rem;
  color: #6b6b6b;
  line-height: 1.6;
`;

const PlanCard = styled.div`
  ${scheduleSurface};
  padding: 1.25rem;
`;

const PlanHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
`;

const PlanTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.65rem;
`;

const PlanTitle = styled.h3`
  margin: 0;
  font-size: 0.875rem;
  font-weight: 700;
  color: #111111;
`;

const DistBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: rgba(22, 160, 88, 0.08);
  border: 1px solid rgba(22, 160, 88, 0.2);
  color: #0f8a4a;
  font-size: 0.688rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const DraftBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: #f5f5f5;
  border: 1px solid #e4e4e4;
  color: #6b6b6b;
  font-size: 0.688rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const ExportBtn = styled.button`
  ${primaryAction};
  padding: 0.45rem 1rem;
  border-radius: 8px;
  font-size: 0.813rem;
  font-weight: 700;
  cursor: pointer;
`;

const PlanTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #e4e4e4;
  border-radius: 8px;
  overflow: hidden;
`;

const PlanTh = styled.th`
  ${scheduleLabel};
  text-align: left;
  padding: 0.75rem 1rem;
  background: #f8f8f8;
  border-bottom: 1px solid #e4e4e4;
`;

const PlanTr = styled.tr`
  &:not(:last-child) td {
    border-bottom: 1px solid #f0f0f0;
  }
  &:hover td {
    background: #fafafa;
  }
`;

const PlanTd = styled.td<{ $time?: boolean; $bold?: boolean }>`
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  font-weight: ${(p) => (p.$bold ? 600 : 400)};
  color: ${(p) => (p.$time ? "#6b6b6b" : "#111111")};
  white-space: ${(p) => (p.$time ? "nowrap" : "normal")};
`;

const PanelBadges = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
`;

const PanelBadge = styled.span<{ $overtime: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: ${(p) => (p.$overtime ? "rgba(178,18,7,0.08)" : "#f0f0f0")};
  border: 1px solid ${(p) => (p.$overtime ? "rgba(178,18,7,0.2)" : "#e4e4e4")};
  color: ${(p) => (p.$overtime ? "#b21207" : "#4b4b4b")};
  font-size: 0.75rem;
  font-weight: 600;
`;
