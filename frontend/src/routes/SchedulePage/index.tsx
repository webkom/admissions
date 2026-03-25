import React, { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAdmission, useAdmissions } from "src/query/hooks";
import { Group, Candidate, Interviewer } from "../../types";
import styled from "styled-components";

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
      committees={groupsToShow}
      isAdmin={is_privileged}
      currentAdmissionSlug={admissionSlug ?? ""}
    />
  );
};

interface CommonScheduleViewProps {
  committees: Group[];
  isAdmin: boolean;
  currentAdmissionSlug: string;
}

type TabType = "my-availability" | "heatmap" | "config" | "solver";

const CommonScheduleView: React.FC<CommonScheduleViewProps> = ({
  committees,
  isAdmin,
  currentAdmissionSlug,
}) => {
  const [activeSection, setActiveSection] =
    useState<TabType>("my-availability");

  const [enabledSlots, setEnabledSlots] = useState<Set<string>>(() => {
    const slots = new Set<string>();
    for (let day = 0; day < 5; day++) {
      // Man-Fre
      for (let hour = 8; hour < 17; hour++) {
        slots.add(`${day}-${hour}`);
      }
    }
    return slots;
  });

  const [candidates] = useState<Candidate[]>(MOCK_CANDIDATES);
  const [interviewers] = useState<Candidate[]>(MOCK_INTERVIEWERS);

  const handleSaveConfig = async (slots: Set<string>) => {
    console.log("Saving config:", Array.from(slots));
    await new Promise((resolve) => setTimeout(resolve, 500));
    alert("Konfigurasjon lagret!");
  };

  return (
    <PageContainer>
      <PageHeader>
        <HeaderContent>
          <h1>
            {isAdmin ? "Intervjuplanlegging - Admin" : "Intervjufordeling"}
          </h1>
          <p>
            Administrer tilgjengelighet og planlegg intervjuer for opptaket.
          </p>
        </HeaderContent>
        {isAdmin && <Badge>{"Test"}</Badge>}
      </PageHeader>

      <TabsContainer>
        {isAdmin && (
          <Tab
            $active={activeSection === "config"}
            onClick={() => setActiveSection("config")}
          >
            Oppsett
          </Tab>
        )}
        <Tab
          $active={activeSection === "my-availability"}
          onClick={() => setActiveSection("my-availability")}
        >
          Min tilgjengelighet
        </Tab>
        <Tab
          $active={activeSection === "heatmap"}
          onClick={() => setActiveSection("heatmap")}
        >
          Oversikt
        </Tab>
        {isAdmin && (
          <Tab
            $active={activeSection === "solver"}
            onClick={() => setActiveSection("solver")}
          >
            Generer plan
          </Tab>
        )}
      </TabsContainer>

      <ContentGrid>
        <MainSection>
          {activeSection === "my-availability" && (
            <Section animate>
              <SectionHeader>
                <h2>Marker din tilgjengelighet</h2>
                <p>
                  Velg tidslukene som passer for deg. Du kan klikke og dra for å
                  velge flere områder samtidig.
                </p>
              </SectionHeader>

              <CalendarWrapper>
                <TimeScheduler
                  enabledSlots={enabledSlots}
                  onSave={async (slots) => {
                    console.log("Saving availability:", Array.from(slots));
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    alert("Tilgjengelighet lagret!");
                  }}
                />
              </CalendarWrapper>
            </Section>
          )}

          {activeSection === "heatmap" && (
            <Section animate>
              <SectionHeader>
                <h2>Tilgjengelighetsoversikt</h2>
                <p>
                  Se når flest intervjuere er tilgjengelige. Dette hjelper med å
                  finne gode fellestider.
                </p>
              </SectionHeader>

              <AvailabilityHeatmap
                interviewers={interviewers}
                availableSlots={enabledSlots}
              />

              <Divider />

              <SectionHeader>
                <h2>Kandidater ({candidates.length})</h2>
                <p>Oversikt over kandidater som skal intervjues.</p>
              </SectionHeader>

              <PersonListView data={candidates} />
            </Section>
          )}

          {activeSection === "config" && isAdmin && (
            <Section animate>
              <SectionHeader>
                <h2>Konfigurer tilgjengelige tider</h2>
                <p>
                  Marker hvilke tidsrom intervjuerne kan velge mellom. Dette
                  avgrenser tidsrammen for hele opptaket.
                </p>
              </SectionHeader>

              <CalendarWrapper>
                <AdminScheduleConfig
                  enabledSlots={enabledSlots}
                  onSlotsChange={setEnabledSlots}
                  onSave={handleSaveConfig}
                />
              </CalendarWrapper>
            </Section>
          )}

          {activeSection === "solver" && isAdmin && (
            <Section animate>
              <SolverView candidates={candidates} interviewers={interviewers} />
            </Section>
          )}
        </MainSection>

        {/*<CommitteesSidebar>
          <SidebarTitle>Dine Komiteer</SidebarTitle>
          <CommitteeList>
            {committees.map((committee) => (
              <CommitteeCard key={committee.pk}>
                <CommitteeInfo>
                  <CommitteeName>{committee.name}</CommitteeName>
                  <CommitteeRole>Intervjuer</CommitteeRole>
                </CommitteeInfo>
              </CommitteeCard>
            ))}
          </CommitteeList>

          <HelpCard>
            <h4>Trenger du hjelp?</h4>
            <p>Ta kontakt med Webkom dersom du opplever problemer med planleggeren.</p>
          </HelpCard>
        </CommitteesSidebar>*/}
      </ContentGrid>
    </PageContainer>
  );
};

export default SchedulePage;

const PageContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem;

  @media (min-width: 768px) {
    padding: 3rem 2rem;
  }
`;

const PageHeader = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2.5rem;
`;

const HeaderContent = styled.div`
  h1 {
    font-size: 2.25rem;
    font-weight: 800;
    color: var(--lego-font-color);
    margin-bottom: 0.5rem;
    letter-spacing: -0.025em;
  }

  p {
    color: var(--color-gray-6);
    font-size: 1.125rem;
  }
`;

const Badge = styled.span`
  background: var(--color-red-1);
  color: var(--color-red-7);
  padding: 0.4rem 0.8rem;
  border-radius: 2rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid var(--color-red-2);
`;

const TabsContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
  background: var(--color-gray-1);
  padding: 0.4rem;
  border-radius: 0.75rem;
  width: fit-content;
  border: 1px solid var(--border-gray);
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 0.6rem 1.25rem;
  background: ${(props) =>
    props.$active ? "var(--lego-card-color)" : "transparent"};
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: ${(props) =>
    props.$active ? "var(--lego-font-color)" : "var(--color-gray-6)"};
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: ${(props) =>
    props.$active ? "0 1px 2px rgba(0,0,0,0.08)" : "none"};

  &:hover {
    color: var(--lego-font-color);
    background: ${(props) =>
      props.$active ? "var(--lego-card-color)" : "var(--color-gray-2)"};
  }
`;

const ContentGrid = styled.div`
  gap: 2.5rem;

  @media (min-width: 1024px) {
    grid-template-columns: 1fr 300px;
  }
`;

const MainSection = styled.div`
  min-width: 0;
`;

const Section = styled.div<{ animate?: boolean }>`
  animation: ${(props) => (props.animate ? "fadeIn 0.4s ease-out" : "none")};

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const SectionHeader = styled.div`
  margin-bottom: 1.5rem;

  h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--lego-font-color);
    margin-bottom: 0.4rem;
  }

  p {
    color: var(--color-gray-6);
    line-height: 1.5;
  }
`;

const CalendarWrapper = styled.div`
  background: var(--lego-card-color);
  border: 1px solid var(--border-gray);
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.05),
    0 2px 4px -1px rgba(0, 0, 0, 0.03);

  @media (min-width: 768px) {
    padding: 2rem;
  }
`;

const Divider = styled.hr`
  border: 0;
  border-top: 1px solid var(--border-gray);
  margin: 3rem 0;
`;

const CommitteesSidebar = styled.aside`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const SidebarTitle = styled.h3`
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-gray-5);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: -0.5rem;
`;

const CommitteeList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const CommitteeCard = styled.div`
  background: var(--lego-card-color);
  border: 1px solid var(--border-gray);
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: transform 0.2s ease;

  &:hover {
    transform: translateX(4px);
    border-color: var(--color-gray-3);
  }
`;

const CommitteeIcon = styled.div`
  width: 40px;
  height: 40px;
  background: var(--color-gray-1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
`;

const CommitteeInfo = styled.div`
  display: flex;
  flex-direction: column;
`;

const CommitteeName = styled.span`
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--lego-font-color);
`;

const CommitteeRole = styled.span`
  font-size: 0.75rem;
  color: var(--color-gray-5);
`;

const HelpCard = styled.div`
  background: linear-gradient(
    135deg,
    var(--color-gray-8) 0%,
    var(--color-black) 100%
  );
  color: white;
  padding: 1.5rem;
  border-radius: 1rem;

  h4 {
    font-weight: 700;
    margin-bottom: 0.5rem;
  }

  p {
    font-size: 0.8125rem;
    opacity: 0.8;
    line-height: 1.4;
  }
`;

const ImportContainer = styled.div`
  background: var(--lego-card-color);
  border: 1px solid var(--border-gray);
  border-radius: var(--border-radius-md);
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);
`;

const ImportHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
`;

const ImportIcon = styled.span`
  font-size: 1.5rem;
`;

const ImportTitle = styled.h4`
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--lego-font-color);
  margin: 0 0 var(--spacing-xs) 0;
`;

const ImportDescription = styled.p`
  font-size: var(--font-size-sm);
  color: var(--color-gray-5);
  margin: 0;
`;

const ImportControls = styled.div`
  display: flex;
  gap: var(--spacing-md);
  align-items: center;

  @media (max-width: 500px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const SelectWrapper = styled.div`
  flex: 1;
`;

const Select = styled.select`
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--lego-background-color);
  border: 1px solid var(--border-gray);
  border-radius: var(--border-radius-sm);
  color: var(--lego-font-color);
  font-size: var(--font-size-sm);
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: var(--lego-font-color);
  }
`;

const ImportButton = styled.button`
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--lego-font-color);
  color: var(--color-white);
  border: none;
  border-radius: var(--border-radius-sm);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: opacity var(--easing-fast);

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const AdminBadge = styled.div`
  background: var(--lego-card-color);
  border: 1px solid var(--border-gray);
  border-radius: var(--border-radius-sm);
  padding: var(--spacing-md);
  margin-top: var(--spacing-md);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
`;

const AdminIcon = styled.span`
  font-size: 1.2rem;
  color: var(--lego-font-color);
`;
