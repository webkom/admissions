import React, { useState } from "react";
import styled from "styled-components";
import type { Candidate, Interviewer } from "../types";
import { apiClient } from "../../../utils/callApi";
import SolverCalendarView from "./SolverCalendarView";
import Icon from "../../Icon";
import {
  primaryAction,
  scheduleInset,
  scheduleLabel,
  scheduleSurface,
} from "../shared";

interface Props {
  candidates: Candidate[];
  interviewers: Interviewer[];
}

interface ScheduleItem {
  candidate: string;
  time: number;
  panel: string[];
}

interface SolveResponse {
  status: "SUCCESS" | "INFEASIBLE";
  schedule: ScheduleItem[];
}

const DAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

export default function SolverView({ candidates, interviewers }: Props) {
  const [panelSize, setPanelSize] = useState(3);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SolveResponse | null>(null);
  const [error, setError] = useState("");
  const [viewType, setViewType] = useState<"list" | "calendar">("list");

  const handleSolve = async () => {
    if (candidates.length === 0 || interviewers.length === 0) {
      setError("Legg til minst én kandidat og én intervjuer.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const payload = { candidates, interviewers, panel_size: panelSize };
      const response = await apiClient.post("/solve/", payload);
      setResult(response.data);
    } catch (err) {
      console.error(err);
      setError("Kunne ikke koble til serveren. Er backend oppe?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <MainCard>
        <Header>
          <TitleSection>
            <Eyebrow>Intervjuforslag</Eyebrow>
            <Title>Generer et planutkast</Title>
            <Subtitle>
              Bruk tilgjengeligheten dere allerede har registrert til å få et
              konkret forslag som kan kvalitetssikres videre.
            </Subtitle>
          </TitleSection>

          <Controls>
            <InputGroup>
              <Label htmlFor="panel-size">Panelstørrelse</Label>
              <Input
                id="panel-size"
                type="number"
                min="1"
                max="5"
                value={panelSize}
                onChange={(e) => {
                  const nextValue = parseInt(e.target.value, 10);
                  if (!isNaN(nextValue)) {
                    setPanelSize(nextValue);
                  }
                }}
              />
            </InputGroup>
            <RunButton type="button" onClick={handleSolve} disabled={loading}>
              {loading ? "Optimaliserer..." : "Generer plan"}
            </RunButton>
          </Controls>
        </Header>

        <StatRow>
          <StatCard>
            <StatLabel>Kandidater</StatLabel>
            <StatValue>{candidates.length}</StatValue>
          </StatCard>
          <StatCard>
            <StatLabel>Intervjuere</StatLabel>
            <StatValue>{interviewers.length}</StatValue>
          </StatCard>
          <StatCard>
            <StatLabel>Panelstørrelse</StatLabel>
            <StatValue>{panelSize}</StatValue>
          </StatCard>
        </StatRow>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {result?.status === "INFEASIBLE" && (
          <StatusBox $type="error">
            <StatusTitle>Ingen løsning funnet</StatusTitle>
            <StatusDesc>
              Nåværende begrensninger er for stramme. Start med lavere
              panelstørrelse eller åpne flere slotter før dere prøver igjen.
            </StatusDesc>
          </StatusBox>
        )}

        {result?.status === "SUCCESS" && (
          <ResultSection>
            <SectionHeader>
              <SectionTitleWrapper>
                <div>
                  <SectionEyebrow>Resultat</SectionEyebrow>
                  <SectionTitle>Generert intervjuplan</SectionTitle>
                </div>
                <StatsBadge>{result.schedule.length} intervjuer</StatsBadge>
              </SectionTitleWrapper>

              <ViewToggle>
                <ToggleButton
                  type="button"
                  $active={viewType === "list"}
                  onClick={() => setViewType("list")}
                  title="Liste-visning"
                >
                  <Icon name="list" size="1.2rem" prefix="ios" />
                </ToggleButton>
                <ToggleButton
                  type="button"
                  $active={viewType === "calendar"}
                  onClick={() => setViewType("calendar")}
                  title="Kalender-visning"
                >
                  <Icon name="calendar" size="1.2rem" prefix="ios" />
                </ToggleButton>
              </ViewToggle>
            </SectionHeader>

            {viewType === "list" ? (
              <TableWrapper>
                <Table>
                  <thead>
                    <tr>
                      <Th>Tidspunkt</Th>
                      <Th>Kandidat</Th>
                      <Th>Intervjupanel</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...result.schedule]
                      .sort((a, b) => a.time - b.time)
                      .map((item, idx) => {
                        const dayIndex = Math.floor(item.time / 24);
                        const hour = item.time % 24;
                        const dayName = DAYS[dayIndex];

                        return (
                          <Tr key={idx}>
                            <TdTime>
                              {dayName} {hour}:00
                            </TdTime>
                            <TdCandidate>{item.candidate}</TdCandidate>
                            <Td>
                              <PanelList>
                                {item.panel.map((p, i) => (
                                  <InterviewerBadge key={i}>
                                    {p}
                                  </InterviewerBadge>
                                ))}
                              </PanelList>
                            </Td>
                          </Tr>
                        );
                      })}
                  </tbody>
                </Table>
              </TableWrapper>
            ) : (
              <SolverCalendarView schedule={result.schedule} />
            )}
          </ResultSection>
        )}
      </MainCard>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const MainCard = styled.div`
  ${scheduleSurface};
  padding: 1.25rem;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
`;

const TitleSection = styled.div`
  flex: 1;
  min-width: 260px;
`;

const Eyebrow = styled.span`
  ${scheduleLabel};
  display: block;
  margin-bottom: 0.3rem;
`;

const Title = styled.h2`
  font-size: 1.2rem;
  font-weight: 800;
  color: #111827;
  margin: 0 0 0.5rem;
`;

const Subtitle = styled.p`
  color: #5b554c;
  font-size: 0.94rem;
  line-height: 1.7;
  margin: 0;
  max-width: 38rem;
`;

const Controls = styled.div`
  ${scheduleInset};
  display: flex;
  align-items: flex-end;
  gap: 0.9rem;
  padding: 0.85rem;
  flex-wrap: wrap;
`;

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`;

const Label = styled.label`
  ${scheduleLabel};
`;

const Input = styled.input`
  width: 4.5rem;
  padding: 0.65rem 0.55rem;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid #d7cbbb;
  border-radius: 0.8rem;
  color: #111827;
  text-align: center;
  font-weight: 700;

  &:focus {
    outline: none;
    border-color: #8a1f16;
    box-shadow: 0 0 0 3px rgba(178, 18, 7, 0.08);
  }
`;

const RunButton = styled.button`
  ${primaryAction};
  padding: 0.78rem 1.15rem;
  border-radius: 0.9rem;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
`;

const StatRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
`;

const StatCard = styled.div`
  ${scheduleInset};
  padding: 0.85rem 0.95rem;
`;

const StatLabel = styled.span`
  ${scheduleLabel};
  display: block;
  margin-bottom: 0.25rem;
`;

const StatValue = styled.span`
  display: block;
  font-size: 1.25rem;
  font-weight: 800;
  color: #111827;
`;

const ErrorMessage = styled.div`
  background: rgba(185, 28, 28, 0.08);
  color: #991b1b;
  padding: 0.95rem 1rem;
  border-radius: 1rem;
  border: 1px solid rgba(185, 28, 28, 0.14);
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 1rem;
`;

const StatusBox = styled.div<{ $type: "error" | "success" }>`
  ${scheduleInset};
  padding: 2rem 1.25rem;
  text-align: center;
  margin-bottom: 1rem;
  border-color: ${(props) =>
    props.$type === "error" ? "rgba(185, 28, 28, 0.16)" : "#e7dccd"};
`;

const StatusTitle = styled.h4`
  font-weight: 800;
  font-size: 1.2rem;
  margin: 0 0 0.75rem;
  color: #111827;
`;

const StatusDesc = styled.p`
  font-size: 0.94rem;
  color: #5b554c;
  max-width: 34rem;
  margin: 0 auto;
  line-height: 1.7;
`;

const ResultSection = styled.div`
  animation: fadeIn 0.35s ease-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
`;

const SectionTitleWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex-wrap: wrap;
`;

const SectionEyebrow = styled.span`
  ${scheduleLabel};
  display: block;
  margin-bottom: 0.25rem;
`;

const ViewToggle = styled.div`
  ${scheduleInset};
  display: flex;
  padding: 0.25rem;
  gap: 0.25rem;
`;

const ToggleButton = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.4rem;
  background: ${(props) =>
    props.$active ? "rgba(178, 18, 7, 0.08)" : "transparent"};
  border: 1px solid
    ${(props) => (props.$active ? "rgba(178, 18, 7, 0.18)" : "transparent")};
  border-radius: 0.7rem;
  cursor: pointer;
  color: ${(props) => (props.$active ? "#8a1f16" : "#6b7280")};
  transition: background-color 0.18s ease;

  &:hover {
    color: #111827;
  }
`;

const SectionTitle = styled.h3`
  font-size: 1.05rem;
  font-weight: 800;
  color: #111827;
  margin: 0;
`;

const StatsBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  background: rgba(31, 122, 92, 0.08);
  color: #166534;
  font-size: 0.82rem;
  font-weight: 700;
`;

const TableWrapper = styled.div`
  ${scheduleInset};
  padding: 0.35rem;
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
`;

const Th = styled.th`
  ${scheduleLabel};
  text-align: left;
  padding: 1rem;
  color: #7a6a5a;
`;

const Tr = styled.tr`
  transition: background-color 0.2s ease;

  &:not(:last-child) td {
    border-bottom: 1px solid #e7dccd;
  }

  &:hover {
    background-color: rgba(255, 255, 255, 0.62);
  }
`;

const Td = styled.td`
  padding: 1rem;
`;

const TdTime = styled(Td)`
  font-family: "OCR A Extended", var(--font-family);
  color: #7a6a5a;
  width: 110px;
`;

const TdCandidate = styled(Td)`
  font-weight: 700;
  color: #111827;
`;

const PanelList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
`;

const InterviewerBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.06);
  color: #374151;
  font-size: 0.78rem;
  font-weight: 600;
`;
