import React, { useState } from "react";
import styled from "styled-components";
import type { Candidate, Interviewer } from "../types";
import { apiClient } from "../../../utils/callApi";

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
    console.log(result);
  };

  return (
    <Container>
      <MainCard>
        <Header>
          <TitleSection>
            <Title>Planleggingsverktøy</Title>
            <Subtitle>
              Generer en optimalisert intervjuplan basert på tilgjengelighet.
            </Subtitle>
          </TitleSection>

          <Controls>
            <InputGroup>
              <Label>Panelstørrelse</Label>
              <Input
                type="number"
                min="1"
                max="5"
                value={panelSize}
                onChange={(e) => setPanelSize(parseInt(e.target.value))}
              />
            </InputGroup>
            <RunButton onClick={handleSolve} disabled={loading}>
              {loading ? "Optimaliserer..." : "Generer plan"}
            </RunButton>
          </Controls>
        </Header>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {result?.status === "INFEASIBLE" && (
          <StatusBox $type="error">
            <StatusTitle>Ingen løsning funnet</StatusTitle>
            <StatusDesc>
              Det er umulig å lage en plan med nåværende begrensninger. Prøv å
              redusere panelstørrelsen eller øke tilgjengeligheten.
            </StatusDesc>
          </StatusBox>
        )}

        {result?.status === "SUCCESS" && (
          <ResultSection>
            <SectionHeader>
              <SectionTitle>Generert intervjuplan</SectionTitle>
              <StatsBadge>{result.schedule.length} intervjuer</StatsBadge>
            </SectionHeader>

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
                  {result.schedule
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
                                <InterviewerBadge key={i}>{p}</InterviewerBadge>
                              ))}
                            </PanelList>
                          </Td>
                        </Tr>
                      );
                    })}
                </tbody>
              </Table>
            </TableWrapper>
          </ResultSection>
        )}
      </MainCard>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const MainCard = styled.div`
  background: var(--lego-card-color);
  border: 1px solid var(--border-gray);
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 2rem;
  margin-bottom: 2.5rem;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const TitleSection = styled.div`
  flex: 1;
`;

const Title = styled.h2`
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--lego-font-color);
  margin: 0 0 0.5rem 0;
`;

const Subtitle = styled.p`
  color: var(--color-gray-6);
  font-size: 0.9375rem;
  line-height: 1.5;
`;

const Controls = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 1rem;
  background: var(--color-gray-1);
  padding: 1rem;
  border-radius: 0.75rem;
  border: 1px solid var(--border-gray);
`;

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`;

const Label = styled.label`
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-gray-5);
`;

const Input = styled.input`
  width: 4rem;
  padding: 0.5rem;
  background: var(--lego-card-color);
  border: 1px solid var(--border-gray);
  border-radius: 0.5rem;
  color: var(--lego-font-color);
  text-align: center;
  font-weight: 600;

  &:focus {
    outline: none;
    border-color: var(--lego-font-color);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.05);
  }
`;

const RunButton = styled.button`
  background: var(--lego-font-color);
  color: white;
  padding: 0.6rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.div`
  background: var(--color-red-1);
  color: var(--color-red-7);
  padding: 1rem;
  border-radius: 0.75rem;
  border: 1px solid var(--color-red-2);
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const StatusBox = styled.div<{ $type: "error" | "success" }>`
  background: var(--color-gray-1);
  border: 1px solid var(--border-gray);
  padding: 2.5rem;
  border-radius: 1rem;
  text-align: center;
  margin-bottom: 2rem;
`;

const StatusTitle = styled.h4`
  font-weight: 800;
  font-size: 1.25rem;
  margin-bottom: 0.75rem;
  color: var(--lego-font-color);
`;

const StatusDesc = styled.p`
  font-size: 0.9375rem;
  color: var(--color-gray-6);
  max-width: 500px;
  margin: 0 auto;
`;

const ResultSection = styled.div`
  animation: fadeIn 0.4s ease-out;
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
`;

const SectionTitle = styled.h3`
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-gray-5);
`;

const StatsBadge = styled.span`
  background: var(--color-blue-1);
  color: var(--color-blue-7);
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 700;
`;

const TableWrapper = styled.div`
  border: 1px solid var(--border-gray);
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  text-align: left;
  padding: 1rem;
  background: var(--color-gray-1);
  border-bottom: 1px solid var(--border-gray);
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-gray-5);
`;

const Tr = styled.tr`
  transition: background-color 0.2s ease;
  &:not(:last-child) {
    border-bottom: 1px solid var(--border-gray);
  }
  &:hover {
    background-color: var(--color-gray-1);
  }
`;

const Td = styled.td`
  padding: 1rem;
`;

const TdTime = styled(Td)`
  font-family: monospace;
  font-weight: 700;
  color: var(--lego-font-color);
  width: 100px;
`;

const TdCandidate = styled(Td)`
  font-weight: 600;
  color: var(--lego-font-color);
`;

const PanelList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const InterviewerBadge = styled.span`
  background: var(--lego-card-color);
  border: 1px solid var(--border-gray);
  padding: 0.2rem 0.6rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-gray-7);
`;
