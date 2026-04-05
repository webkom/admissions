import React, { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import styled, { css } from "styled-components";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarRange,
  LayoutPanelTop,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAdmission } from "src/query/hooks";
import { media } from "src/styles/mediaQueries";
import {
  scheduleInset,
  scheduleLabel,
  scheduleSurface,
} from "src/components/Scheduling/shared";
import { Group, Candidate, Interviewer } from "../../types";
import TimeScheduler from "src/components/Scheduling/Calendar/Calendar";
import PersonListView from "src/components/Scheduling/PersonList/PersonListView";
import SolverView from "src/components/Scheduling/Solver/SolverView";
import AvailabilityHeatmap from "src/components/Scheduling/Calendar/AvailabilityHeatmap";
import AdminScheduleConfig from "src/components/Scheduling/Calendar/AdminScheduleConfig";
import { MOCK_CANDIDATES, MOCK_INTERVIEWERS } from "./mockData";

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
      committees={groupsToShow}
      isAdmin={is_privileged}
    />
  );
};

interface CommonScheduleViewProps {
  admissionTitle: string;
  committees: Group[];
  isAdmin: boolean;
}

type TabType = "my-availability" | "heatmap" | "config" | "solver";

interface TabDefinition {
  key: TabType;
  title: string;
  description: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const CommonScheduleView: React.FC<CommonScheduleViewProps> = ({
  admissionTitle,
  committees,
  isAdmin,
}) => {
  const [activeSection, setActiveSection] =
    useState<TabType>("my-availability");

  const [enabledSlots, setEnabledSlots] = useState<Set<string>>(() => {
    const slots = new Set<string>();
    for (let day = 0; day < 5; day++) {
      for (let hour = 8; hour < 17; hour++) {
        slots.add(`${day}-${hour * 60}`);
      }
    }
    return slots;
  });

  const [candidates] = useState<Candidate[]>(MOCK_CANDIDATES);
  const [interviewers] = useState<Interviewer[]>(MOCK_INTERVIEWERS);
  const [sessionDuration, setSessionDuration] = useState<number>(60);

  const handleSaveConfig = async (slots: Set<string>) => {
    console.log("Saving config:", Array.from(slots));
    await new Promise((resolve) => setTimeout(resolve, 500));
    alert("Konfigurasjon lagret!");
  };

  const availableDays = useMemo(
    () => new Set(Array.from(enabledSlots, (slot) => slot.split("-")[0])).size,
    [enabledSlots],
  );

  const plannedHours = useMemo(
    () => Math.round((enabledSlots.size * sessionDuration) / 60),
    [enabledSlots.size, sessionDuration],
  );

  const tabDefinitions = useMemo<TabDefinition[]>(
    () =>
      [
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
      ].filter((tab) => !tab.adminOnly || isAdmin),
    [isAdmin],
  );

  const activeTab =
    tabDefinitions.find((tab) => tab.key === activeSection) ??
    tabDefinitions[0];
  const ActiveTabIcon = activeTab.icon;

  const compactMetrics = [
    { label: "Intervjuere", value: interviewers.length },
    { label: "Kandidater", value: candidates.length },
    { label: "Dager", value: availableDays },
    { label: "Kapasitet", value: `${plannedHours} t` },
  ];

  return (
    <PageBackground>
      <PageContainer>
        <HeaderBlock>
          <HeaderMain>
            <HeaderTopline>
              <Eyebrow>Intervjuplanlegging</Eyebrow>
              <RoleBadge>
                <ShieldCheck size={14} />
                {isAdmin ? "Admin" : "Intervjuer"}
              </RoleBadge>
            </HeaderTopline>
            <Title>{admissionTitle}</Title>
            <Lead>
              En enklere arbeidsflate for rammer, tilgjengelighet og fordeling.
            </Lead>
          </HeaderMain>

          <StatsRow>
            {compactMetrics.map((item) => (
              <StatPill key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </StatPill>
            ))}
          </StatsRow>
        </HeaderBlock>

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
                <Icon size={16} />
                {tab.title}
              </TabButton>
            );
          })}
        </TabBar>

        <SectionHeader>
          <SectionMeta>
            <SectionIcon>
              <ActiveTabIcon size={16} />
            </SectionIcon>
            <div>
              <SectionTitle>{activeTab.title}</SectionTitle>
              <SectionDescription>{activeTab.description}</SectionDescription>
            </div>
          </SectionMeta>

          <MetaChips>
            <MetaChip>
              <span>Slotter åpne</span>
              <strong>{enabledSlots.size}</strong>
            </MetaChip>
            <MetaChip>
              <span>Varighet</span>
              <strong>{sessionDuration} min</strong>
            </MetaChip>
            {committees.length > 0 && (
              <MetaChip>
                <span>Komiteer</span>
                <strong>{committees.length}</strong>
              </MetaChip>
            )}
          </MetaChips>
        </SectionHeader>

        {committees.length > 0 && (
          <CommitteeStrip>
            {committees.map((committee) => {
              const committeeName = committee.name?.trim() || "Ukjent komite";

              return (
                <CommitteeChip key={committee.pk}>
                  <CommitteeInitial>{committeeName.charAt(0)}</CommitteeInitial>
                  <span>{committeeName}</span>
                </CommitteeChip>
              );
            })}
          </CommitteeStrip>
        )}

        <ContentStack>
          {activeSection === "my-availability" && (
            <TimeScheduler
              enabledSlots={enabledSlots}
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
                sessionDuration={sessionDuration}
              />

              <SubSection>
                <SubSectionHeader>
                  <div>
                    <SubEyebrow>Kandidater</SubEyebrow>
                    <SubTitle>Hvem som skal fordeles</SubTitle>
                  </div>
                  <SubCount>{candidates.length}</SubCount>
                </SubSectionHeader>
                <PersonListView data={candidates} />
              </SubSection>
            </>
          )}

          {activeSection === "config" && isAdmin && (
            <AdminScheduleConfig
              enabledSlots={enabledSlots}
              onSlotsChange={setEnabledSlots}
              onSave={handleSaveConfig}
              sessionDuration={sessionDuration}
              onSessionDurationChange={setSessionDuration}
            />
          )}

          {activeSection === "solver" && isAdmin && (
            <SolverView candidates={candidates} interviewers={interviewers} />
          )}
        </ContentStack>
      </PageContainer>
    </PageBackground>
  );
};

export default SchedulePage;

const PageBackground = styled.div`
  min-height: calc(100vh - 80px);
  background: #f4efe7;
`;

const PageContainer = styled.div`
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;

  ${media.handheld`
    padding: 1.25rem 0.85rem 2rem;
  `};
`;

const HeaderBlock = styled.header`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.25rem;
`;

const HeaderMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
`;

const HeaderTopline = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const Eyebrow = styled.span`
  ${scheduleLabel};
`;

const RoleBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.06);
  color: #374151;
  font-size: 0.8rem;
  font-weight: 700;
`;

const Title = styled.h1`
  margin: 0;
  color: #111827;
  font-size: clamp(1.8rem, 4vw, 2.6rem);
  line-height: 1.05;
  letter-spacing: -0.04em;
  text-align: left;
`;

const Lead = styled.p`
  margin: 0;
  color: #5b554c;
  font-size: 0.98rem;
  line-height: 1.6;
`;

const StatsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
`;

const StatPill = styled.div`
  ${scheduleInset};
  display: inline-flex;
  align-items: baseline;
  gap: 0.45rem;
  padding: 0.55rem 0.8rem;

  span {
    ${scheduleLabel};
  }

  strong {
    color: #111827;
    font-size: 0.95rem;
  }
`;

const TabBar = styled.div`
  ${scheduleSurface};
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.45rem;
  margin-bottom: 1rem;
`;

const TabButton = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.7rem 0.95rem;
  border-radius: 0.8rem;
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 700;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease;

  ${(props) =>
    props.$active
      ? css`
          background: #ffffff;
          color: #111827;
          border-color: #ddd2c3;
        `
      : css`
          background: transparent;
          color: #6b7280;

          &:hover {
            background: rgba(255, 255, 255, 0.6);
            color: #111827;
          }
        `}
`;

const SectionHeader = styled.section`
  ${scheduleSurface};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  margin-bottom: 0.85rem;
  flex-wrap: wrap;
`;

const SectionMeta = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
`;

const SectionIcon = styled.span`
  width: 2rem;
  height: 2rem;
  border-radius: 0.7rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(17, 24, 39, 0.06);
  color: #374151;
`;

const SectionTitle = styled.h2`
  margin: 0 0 0.2rem;
  color: #111827;
  font-size: 1.05rem;
`;

const SectionDescription = styled.p`
  margin: 0;
  color: #6b7280;
  line-height: 1.55;
  font-size: 0.9rem;
`;

const MetaChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const MetaChip = styled.div`
  ${scheduleInset};
  display: inline-flex;
  align-items: baseline;
  gap: 0.45rem;
  padding: 0.5rem 0.75rem;

  span {
    ${scheduleLabel};
  }

  strong {
    color: #111827;
    font-size: 0.92rem;
  }
`;

const CommitteeStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.85rem;
`;

const CommitteeChip = styled.div`
  ${scheduleInset};
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.5rem 0.75rem;

  span {
    color: #4b5563;
    font-size: 0.9rem;
    font-weight: 600;
  }
`;

const CommitteeInitial = styled.span`
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(178, 18, 7, 0.08);
  color: #8a1f16;
  font-size: 0.78rem;
  font-weight: 800;
`;

const ContentStack = styled.main`
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
`;

const SubSection = styled.section`
  ${scheduleSurface};
  padding: 1rem;
`;

const SubSectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.9rem;
`;

const SubEyebrow = styled.span`
  ${scheduleLabel};
  display: block;
  margin-bottom: 0.15rem;
`;

const SubTitle = styled.h3`
  margin: 0;
  color: #111827;
  font-size: 1rem;
`;

const SubCount = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.6rem;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.06);
  color: #111827;
  font-weight: 800;
`;
