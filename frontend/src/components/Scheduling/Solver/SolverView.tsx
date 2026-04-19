import React, { useMemo, useState } from "react";
import styled from "styled-components";
import { ChevronDown } from "lucide-react";
import type {
  Candidate,
  Interviewer,
  ScheduleItem,
  SolverOptions,
} from "../types";
import { apiClient } from "../../../utils/callApi";
import SolverCalendarView from "./SolverCalendarView";
import Icon from "../../Icon";
import {
  primaryAction,
  scheduleBadge,
  scheduleInput,
  scheduleInset,
  scheduleLabel,
  scheduleSurface,
} from "../shared";
import { formatDateHeader, generateIcs } from "../scheduleUtils";
import { useSavedSchedule } from "../../../query/hooks";

interface Props {
  candidates: Candidate[];
  interviewers: Interviewer[];
  dates: string[];
  sessionDuration: number;
  admissionTitle: string;
  admissionSlug: string;
}

interface SolveResponse {
  status: "SUCCESS" | "INFEASIBLE";
  schedule: ScheduleItem[];
}

const DEFAULT_SOLVER_OPTIONS: SolverOptions = {
  enforce_same_gender: true,
  allow_overtime: true,
  overtime_weight: 100,
  load_balance_weight: 1,
  max_solver_seconds: 10,
};

const PRIORITY_PRESETS = [
  {
    key: "protect-availability",
    label: "Minimer overtid",
    description: "Spar intervjuere utenfor registrert tilgjengelighet.",
    overtimeWeight: 100,
    loadBalanceWeight: 1,
  },
  {
    key: "balanced",
    label: "Balansert",
    description: "Unngå overtid, men jobb samtidig for en jevnere fordeling.",
    overtimeWeight: 40,
    loadBalanceWeight: 4,
  },
  {
    key: "protect-load",
    label: "Jevn fordeling",
    description: "Fordel belastningen jevnere, selv om det kan gi noe overtid.",
    overtimeWeight: 12,
    loadBalanceWeight: 8,
  },
] as const;

export default function SolverView({
  candidates,
  interviewers,
  dates,
  sessionDuration,
  admissionTitle,
  admissionSlug,
}: Props) {
  const [panelSize, setPanelSize] = useState(3);
  const [solverOptions, setSolverOptions] = useState<SolverOptions>(
    DEFAULT_SOLVER_OPTIONS,
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SolveResponse | null>(null);
  const [error, setError] = useState("");
  const [viewType, setViewType] = useState<"list" | "calendar" | "person">(
    "list",
  );
  const [selectedInterviewer, setSelectedInterviewer] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const { data: savedSchedule, refetch: refetchSaved } =
    useSavedSchedule(admissionSlug);

  const sortedSchedule = useMemo(
    () => [...(result?.schedule ?? [])].sort((a, b) => a.time - b.time),
    [result],
  );

  const interviewerDistribution = useMemo(() => {
    const counts = new Map(
      interviewers.map((interviewer) => [
        interviewer.name,
        { name: interviewer.name, count: 0, overtimeCount: 0 },
      ]),
    );

    sortedSchedule.forEach((item) => {
      item.panel.forEach((member) => {
        const existing = counts.get(member.name) ?? {
          name: member.name,
          count: 0,
          overtimeCount: 0,
        };

        existing.count += 1;
        if (member.is_overtime) {
          existing.overtimeCount += 1;
        }

        counts.set(member.name, existing);
      });
    });

    return Array.from(counts.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name, "nb");
    });
  }, [interviewers, sortedSchedule]);

  const selectedInterviewerSchedule = useMemo(() => {
    if (!selectedInterviewer) {
      return [];
    }

    return sortedSchedule.filter((item) =>
      item.panel.some((member) => member.name === selectedInterviewer),
    );
  }, [selectedInterviewer, sortedSchedule]);

  const totalAssignments = useMemo(
    () =>
      interviewerDistribution.reduce(
        (sum, interviewer) => sum + interviewer.count,
        0,
      ),
    [interviewerDistribution],
  );

  const selectedPriorityPreset = useMemo(
    () =>
      PRIORITY_PRESETS.find(
        (preset) =>
          preset.overtimeWeight === solverOptions.overtime_weight &&
          preset.loadBalanceWeight === solverOptions.load_balance_weight,
      )?.key ?? "custom",
    [solverOptions.load_balance_weight, solverOptions.overtime_weight],
  );

  const formatSlotTime = (timeValue: number) => {
    const dayIndex = Math.floor(timeValue / 24);
    const hour = timeValue % 24;
    const date = dates[dayIndex];
    if (!date) return `Dag ${dayIndex + 1} ${hour}:00`;
    const { weekday, dayMonth } = formatDateHeader(date);
    return `${weekday} ${dayMonth} ${hour}:00`;
  };

  const handleSolve = async () => {
    if (candidates.length === 0 || interviewers.length === 0) {
      setError("Legg til minst én kandidat og én intervjuer.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setSelectedInterviewer("");

    try {
      const payload = {
        candidates,
        interviewers,
        panel_size: panelSize,
        options: solverOptions,
      };
      const response = await apiClient.post("/solve/", payload);
      setResult(response.data);
    } catch (err) {
      console.error(err);
      setError("Kunne ikke koble til serveren. Er backend oppe?");
    } finally {
      setLoading(false);
    }
  };

  const handleExportIcs = () => {
    const schedule = result?.schedule ?? savedSchedule?.schedule ?? [];
    if (schedule.length === 0) return;

    const icsContent = generateIcs(schedule, dates, sessionDuration, admissionTitle);
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `intervjuplan-${admissionTitle.replace(/\s+/g, "-").toLowerCase()}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = async (distribute: boolean) => {
    const schedule = result?.schedule;
    if (!schedule || schedule.length === 0) return;
    setIsSaving(true);
    setSaveError("");
    try {
      await apiClient.post(`/admin/admission/${admissionSlug}/schedule/`, {
        schedule,
        start_date: dates[0] ?? "",
        session_duration: sessionDuration,
        is_distributed: distribute,
      });
      await refetchSaved();
    } catch {
      setSaveError("Kunne ikke lagre planen. Prøv igjen.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnlock = async () => {
    if (!savedSchedule) return;
    setIsSaving(true);
    setSaveError("");
    try {
      await apiClient.post(`/admin/admission/${admissionSlug}/schedule/`, {
        schedule: savedSchedule.schedule,
        start_date: savedSchedule.start_date,
        session_duration: savedSchedule.session_duration,
        is_distributed: false,
      });
      await refetchSaved();
    } catch {
      setSaveError("Kunne ikke låse opp planen.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateSolverOption = <K extends keyof SolverOptions>(
    key: K,
    value: SolverOptions[K],
  ) => {
    setSolverOptions((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const toggleSolverOption = (
    key: "enforce_same_gender" | "allow_overtime",
  ) => {
    updateSolverOption(key, !solverOptions[key]);
  };

  const handleToggleCardKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    key: "enforce_same_gender" | "allow_overtime",
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleSolverOption(key);
    }
  };

  const applyPriorityPreset = (
    overtimeWeight: number,
    loadBalanceWeight: number,
  ) => {
    setSolverOptions((current) => ({
      ...current,
      overtime_weight: overtimeWeight,
      load_balance_weight: loadBalanceWeight,
    }));
  };

  return (
    <Container>
      <MainCard>
        <Header>
          <TitleSection>
            <Title>Generer en plan</Title>
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
            <StatLabel>Antall intervjuere</StatLabel>
            <StatValue>{panelSize}</StatValue>
          </StatCard>
        </StatRow>

        <OptionsPanel>
          <OptionsIntro>
            <SectionEyebrow>Før du genererer</SectionEyebrow>
            <SectionTitle>Velg krav og prioriteringer</SectionTitle>
            <OptionsLead>
              Klikk på et kort for å slå en regel av eller på. Åpne detaljene
              bare når du vil lese forklaringen.
            </OptionsLead>
          </OptionsIntro>

          <OptionsGrid>
            <ToggleCard
              role="button"
              tabIndex={0}
              $active={solverOptions.enforce_same_gender}
              aria-pressed={solverOptions.enforce_same_gender}
              onClick={() => toggleSolverOption("enforce_same_gender")}
              onKeyDown={(event) =>
                handleToggleCardKeyDown(event, "enforce_same_gender")
              }
            >
              <OptionHeader>
                <OptionEyebrow>Panelregel</OptionEyebrow>
                <ToggleState $active={solverOptions.enforce_same_gender}>
                  {solverOptions.enforce_same_gender ? "På" : "Av"}
                </ToggleState>
              </OptionHeader>
              <OptionTitle>Samme kjønn i panelet</OptionTitle>
              <OptionHint>
                Krev minst én intervjuer av samme kjønn som kandidaten.
              </OptionHint>
              <OptionDetails
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <OptionSummary>
                  <SummaryLabel>Les detaljene</SummaryLabel>
                  <SummaryIcon />
                </OptionSummary>
                <OptionDetailsBody>
                  Når denne regelen er på, må hvert intervju ha minst én person
                  i panelet som matcher kandidatens kjønn. Hvis det ikke finnes,
                  blir akkurat det oppsettet vurdert som ugyldig.
                </OptionDetailsBody>
              </OptionDetails>
            </ToggleCard>

            <ToggleCard
              role="button"
              tabIndex={0}
              $active={solverOptions.allow_overtime}
              aria-pressed={solverOptions.allow_overtime}
              onClick={() => toggleSolverOption("allow_overtime")}
              onKeyDown={(event) =>
                handleToggleCardKeyDown(event, "allow_overtime")
              }
            >
              <OptionHeader>
                <OptionEyebrow>Tilgjengelighet</OptionEyebrow>
                <ToggleState $active={solverOptions.allow_overtime}>
                  {solverOptions.allow_overtime ? "På" : "Av"}
                </ToggleState>
              </OptionHeader>
              <OptionTitle>Tillat overtid</OptionTitle>
              <OptionHint>
                La solveren bruke intervjuere utenfor registrert
                tilgjengelighet når det trengs.
              </OptionHint>
              <OptionDetails
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <OptionSummary>
                  <SummaryLabel>Les detaljene</SummaryLabel>
                  <SummaryIcon />
                </OptionSummary>
                <OptionDetailsBody>
                  Når denne er av, får solveren bare bruke slotter folk faktisk
                  har merket som tilgjengelige. Når den er på, kan den bruke
                  andre slotter også, men markere dem som overtid i resultatet.
                </OptionDetailsBody>
              </OptionDetails>
            </ToggleCard>

            <PriorityCard>
              <OptionHeader>
                <OptionEyebrow>Prioritering</OptionEyebrow>
                <PriorityBadge>
                  {selectedPriorityPreset === "custom"
                    ? "Tilpasset"
                    : "Forhåndsvalg"}
                </PriorityBadge>
              </OptionHeader>
              <OptionTitle>Hva skal solveren ofre først?</OptionTitle>
              <OptionHint>
                Dette styrer hva som teller mest når ikke alt kan oppfylles
                samtidig.
              </OptionHint>
              <PriorityGrid>
                {PRIORITY_PRESETS.map((preset) => (
                  <PriorityOption
                    key={preset.key}
                    type="button"
                    $active={selectedPriorityPreset === preset.key}
                    onClick={() =>
                      applyPriorityPreset(
                        preset.overtimeWeight,
                        preset.loadBalanceWeight,
                      )
                    }
                  >
                    <PriorityTitle>{preset.label}</PriorityTitle>
                    <PriorityDescription>{preset.description}</PriorityDescription>
                  </PriorityOption>
                ))}
              </PriorityGrid>
              <OptionDetails>
                <OptionSummary>
                  <SummaryLabel>Hva betyr dette i praksis?</SummaryLabel>
                  <SummaryIcon />
                </OptionSummary>
                <OptionDetailsBody>
                  Overtidsvekten sier hvor dyrt det er å bruke folk utenfor
                  tilgjengeligheten sin. Fordelingsvekten sier hvor hardt
                  solveren skal prøve å unngå at noen får klart flere intervjuer
                  enn resten.
                </OptionDetailsBody>
                <ManualHeading>Finjuster manuelt</ManualHeading>
                <OptionHint>
                  Hvis presetene ikke passer helt, kan du justere tallene direkte
                  her.
                </OptionHint>
                <InputGroup>
                  <Label htmlFor="overtime-weight">Overtidsvekt</Label>
                  <NumberInput
                    id="overtime-weight"
                    type="number"
                    min="0"
                    value={solverOptions.overtime_weight}
                    onChange={(event) =>
                      updateSolverOption(
                        "overtime_weight",
                        Math.max(0, Number(event.target.value) || 0),
                      )
                    }
                    disabled={!solverOptions.allow_overtime}
                  />
                </InputGroup>
                <InputGroup>
                  <Label htmlFor="load-balance-weight">Fordelingsvekt</Label>
                  <NumberInput
                    id="load-balance-weight"
                    type="number"
                    min="0"
                    value={solverOptions.load_balance_weight}
                    onChange={(event) =>
                      updateSolverOption(
                        "load_balance_weight",
                        Math.max(0, Number(event.target.value) || 0),
                      )
                    }
                  />
                </InputGroup>
              </OptionDetails>
            </PriorityCard>
          </OptionsGrid>
        </OptionsPanel>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {result?.status === "INFEASIBLE" && (
          <StatusBox $type="error">
            <StatusTitle>Ingen løsning funnet</StatusTitle>
            <StatusDesc>
              Nåværende begrensninger er for stramme. Start med lavere
              panelstørrelse eller åpne flere slots før dere prøver igjen.
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
                <ToggleLabelButton
                  type="button"
                  $active={viewType === "person"}
                  onClick={() => setViewType("person")}
                  title="Personvisning"
                >
                  Person
                </ToggleLabelButton>
              </ViewToggle>
            </SectionHeader>

            {viewType === "person" ? (
              <PersonPane>
                <PersonControls>
                  <FilterGroup>
                    <Label htmlFor="interviewer-filter">Velg intervjuer</Label>
                    <FilterSelect
                      id="interviewer-filter"
                      value={selectedInterviewer}
                      onChange={(event) =>
                        setSelectedInterviewer(event.target.value)
                      }
                    >
                      <option value="">Velg en person</option>
                      {interviewerDistribution.map((interviewer) => (
                        <option key={interviewer.name} value={interviewer.name}>
                          {interviewer.name}
                        </option>
                      ))}
                    </FilterSelect>
                  </FilterGroup>
                </PersonControls>

                <DistributionSection>
                  <DistributionHeader>
                    <SectionEyebrow>Fordeling</SectionEyebrow>
                    <DistributionHint>
                      Klikk på en person for å åpne intervjuene deres.
                    </DistributionHint>
                  </DistributionHeader>

                  <DistributionGrid>
                    <DistributionCard type="button" $active={false}>
                      <DistributionName>Alle intervjuere</DistributionName>
                      <DistributionValue>{totalAssignments}</DistributionValue>
                      <DistributionMeta>Totale tildelinger</DistributionMeta>
                    </DistributionCard>

                    {interviewerDistribution.map((interviewer) => (
                      <DistributionCard
                        key={interviewer.name}
                        type="button"
                        $active={selectedInterviewer === interviewer.name}
                        onClick={() => setSelectedInterviewer(interviewer.name)}
                      >
                        <DistributionName>{interviewer.name}</DistributionName>
                        <DistributionValue>{interviewer.count}</DistributionValue>
                        <DistributionMeta>
                          {interviewer.overtimeCount > 0
                            ? `${interviewer.overtimeCount} overtid`
                            : "Ingen overtid"}
                        </DistributionMeta>
                      </DistributionCard>
                    ))}
                  </DistributionGrid>
                </DistributionSection>

                {!selectedInterviewer ? (
                  <EmptyState>Velg en intervjuer for å se intervjuene.</EmptyState>
                ) : selectedInterviewerSchedule.length === 0 ? (
                  <EmptyState>
                    {selectedInterviewer} har ingen tildelte intervjuer.
                  </EmptyState>
                ) : (
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
                        {selectedInterviewerSchedule.map((item, idx) => {
                          return (
                            <Tr key={idx}>
                              <TdTime>
                                {formatSlotTime(item.time)}
                              </TdTime>
                              <TdCandidate>{item.candidate}</TdCandidate>
                              <Td>
                                <PanelList>
                                  {item.panel.map((p, i) => (
                                    <InterviewerBadge
                                      key={i}
                                      $isOvertime={p.is_overtime}
                                      title={
                                        p.is_overtime
                                          ? "Utenfor registrert tilgjengelighet"
                                          : undefined
                                      }
                                    >
                                      {p.name}
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
                )}
              </PersonPane>
            ) : viewType === "list" ? (
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
                    {sortedSchedule.map((item, idx) => {
                      return (
                        <Tr key={idx}>
                          <TdTime>
                            {formatSlotTime(item.time)}
                          </TdTime>
                          <TdCandidate>{item.candidate}</TdCandidate>
                          <Td>
                            <PanelList>
                              {item.panel.map((p, i) => (
                                <InterviewerBadge
                                  key={i}
                                  $isOvertime={p.is_overtime}
                                  title={
                                    p.is_overtime
                                      ? "Utenfor registrert tilgjengelighet"
                                      : undefined
                                  }
                                >
                                  {p.name}
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
              <SolverCalendarView schedule={sortedSchedule} dates={dates} />
            )}

            <ResultFooter>
              <ExportButton type="button" onClick={handleExportIcs}>
                <Icon name="download" size="0.9rem" prefix="ios" />
                Eksporter til kalender (.ics)
              </ExportButton>
              <ActionGroup>
                {savedSchedule?.is_distributed ? (
                  <>
                    <DistributedBadge>Distribuert</DistributedBadge>
                    <SecondaryBtn type="button" onClick={handleUnlock} disabled={isSaving}>
                      Lås opp for redigering
                    </SecondaryBtn>
                  </>
                ) : (
                  <>
                    <SecondaryBtn
                      type="button"
                      onClick={() => handleSave(false)}
                      disabled={isSaving}
                    >
                      {isSaving ? "Lagrer..." : "Lagre plan"}
                    </SecondaryBtn>
                    <DistributeButton
                      type="button"
                      onClick={() => handleSave(true)}
                      disabled={isSaving}
                    >
                      Lås og distribuer
                    </DistributeButton>
                  </>
                )}
              </ActionGroup>
              {saveError && <SaveErrorMsg>{saveError}</SaveErrorMsg>}
            </ResultFooter>
          </ResultSection>
        )}
      </MainCard>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
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
  min-width: 200px;
`;

const Title = styled.h2`
  font-size: 0.875rem;
  font-weight: 700;
  color: #111111;
  margin: 0 0 0.25rem;
`;

const Controls = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const Label = styled.label`
  ${scheduleLabel};
`;

const Input = styled.input`
  width: 4rem;
  ${scheduleInput};
  text-align: center;
  font-weight: 700;
`;

const RunButton = styled.button`
  ${primaryAction};
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  font-size: 0.813rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
`;

const StatRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e4e4e4;
`;

const StatCard = styled.div`
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
`;

const StatLabel = styled.span`
  ${scheduleLabel};
`;

const StatValue = styled.span`
  font-size: 0.875rem;
  font-weight: 700;
  color: #111111;
`;

const OptionsPanel = styled.div`
  ${scheduleInset};
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1rem;
  margin-bottom: 1rem;
`;

const OptionsIntro = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
`;

const OptionsLead = styled.p`
  margin: 0;
  color: #6b6b6b;
  font-size: 0.813rem;
  line-height: 1.55;
  max-width: 42rem;
`;

const OptionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
`;

const BaseOptionCard = styled.div`
  ${scheduleSurface};
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 0.95rem;
`;

const ToggleCard = styled(BaseOptionCard)<{ $active: boolean }>`
  cursor: pointer;
  border-color: ${(props) =>
    props.$active ? "rgba(178, 18, 7, 0.22)" : "#e4e4e4"};
  background: ${(props) =>
    props.$active
      ? "linear-gradient(180deg, rgba(178, 18, 7, 0.05) 0%, #ffffff 100%)"
      : "#ffffff"};
  box-shadow: ${(props) =>
    props.$active ? "0 12px 28px rgba(178, 18, 7, 0.08)" : "none"};
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(178, 18, 7, 0.18);
  }

  &:focus-visible {
    outline: 2px solid rgba(178, 18, 7, 0.25);
    outline-offset: 2px;
  }
`;

const PriorityCard = styled(BaseOptionCard)`
  grid-column: 1 / -1;
`;

const OptionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.3rem;
`;

const OptionEyebrow = styled.span`
  ${scheduleLabel};
`;

const OptionTitle = styled.h4`
  font-size: 0.875rem;
  font-weight: 700;
  color: #111111;
  margin: 0;
`;

const OptionHint = styled.p`
  margin: 0;
  color: #6b6b6b;
  font-size: 0.813rem;
  line-height: 1.5;
`;

const ToggleState = styled.span<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 3rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  background: ${(props) =>
    props.$active ? "rgba(178, 18, 7, 0.12)" : "#f0f0f0"};
  color: ${(props) => (props.$active ? "#b21207" : "#6b6b6b")};
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const PriorityBadge = styled(ToggleState).attrs({ as: "span" })`
  background: rgba(17, 17, 17, 0.05);
  color: #4b4b4b;
`;

const OptionDetails = styled.details`
  display: grid;
  gap: 0.55rem;
  padding-top: 0.1rem;

  &[open] svg {
    transform: rotate(180deg);
  }
`;

const OptionSummary = styled.summary`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  list-style: none;
  width: fit-content;
  color: #6b6b6b;

  &::-webkit-details-marker {
    display: none;
  }
`;

const SummaryLabel = styled.span`
  ${scheduleLabel};
  letter-spacing: 0.03em;
`;

const SummaryIcon = styled(ChevronDown)`
  width: 0.9rem;
  height: 0.9rem;
  transition: transform 0.16s ease;
`;

const OptionDetailsBody = styled.p`
  margin: 0;
  color: #4b4b4b;
  font-size: 0.813rem;
  line-height: 1.6;
`;

const PriorityGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.6rem;
`;

const PriorityOption = styled.button<{ $active: boolean }>`
  ${scheduleInset};
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  padding: 0.85rem 0.95rem;
  text-align: left;
  cursor: pointer;
  border-color: ${(props) =>
    props.$active ? "rgba(178, 18, 7, 0.22)" : "#e4e4e4"};
  background: ${(props) =>
    props.$active ? "rgba(178, 18, 7, 0.06)" : "#f7f7f7"};
  transition:
    border-color 0.16s ease,
    transform 0.16s ease,
    background 0.16s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(178, 18, 7, 0.18);
  }
`;

const PriorityTitle = styled.span`
  font-size: 0.813rem;
  font-weight: 700;
  color: #111111;
`;

const PriorityDescription = styled.span`
  color: #6b6b6b;
  font-size: 0.78rem;
  line-height: 1.45;
`;

const ManualHeading = styled.h5`
  margin: 0.2rem 0 0;
  font-size: 0.75rem;
  font-weight: 700;
  color: #111111;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const NumberInput = styled(Input)`
  width: 100%;
  text-align: left;
`;

const ErrorMessage = styled.div`
  background: rgba(178, 18, 7, 0.06);
  color: #b21207;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 1px solid rgba(178, 18, 7, 0.14);
  font-size: 0.813rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
`;

const StatusBox = styled.div<{ $type: "error" | "success" }>`
  ${scheduleInset};
  padding: 2rem 1.25rem;
  text-align: center;
  margin-bottom: 0.75rem;
  border-color: ${(props) =>
    props.$type === "error" ? "rgba(178, 18, 7, 0.14)" : "#e4e4e4"};
`;

const StatusTitle = styled.h4`
  font-weight: 700;
  font-size: 1rem;
  margin: 0 0 0.5rem;
  color: #111111;
`;

const StatusDesc = styled.p`
  font-size: 0.813rem;
  color: #a0a0a0;
  max-width: 32rem;
  margin: 0 auto;
  line-height: 1.7;
`;

const ResultSection = styled.div`
  animation: fadeIn 0.25s ease-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(6px);
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
  gap: 0.75rem;
  margin-bottom: 0.875rem;
  flex-wrap: wrap;
`;

const SectionTitleWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
`;

const SectionEyebrow = styled.span`
  ${scheduleLabel};
  display: block;
  margin-bottom: 0.2rem;
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const FilterSelect = styled.select`
  ${scheduleInput};
  min-width: 14rem;
  font-weight: 600;
`;

const ViewToggle = styled.div`
  display: flex;
  padding: 3px;
  gap: 3px;
  background: #f5f5f5;
  border: 1px solid #e4e4e4;
  border-radius: 8px;
`;

const ToggleButton = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  background: ${(props) => (props.$active ? "#ffffff" : "transparent")};
  border: 1px solid ${(props) => (props.$active ? "#e4e4e4" : "transparent")};
  border-radius: 6px;
  cursor: pointer;
  color: ${(props) => (props.$active ? "#111111" : "#a0a0a0")};
  transition: all 0.12s ease;

  &:hover {
    color: #111111;
  }
`;

const ToggleLabelButton = styled(ToggleButton)`
  width: auto;
  padding: 0 0.75rem;
  font-size: 0.75rem;
  font-weight: 700;
`;

const SectionTitle = styled.h3`
  font-size: 0.875rem;
  font-weight: 700;
  color: #111111;
  margin: 0;
`;

const StatsBadge = styled.span`
  ${scheduleBadge};
  color: #b21207;
  border-color: rgba(178, 18, 7, 0.14);
  background: rgba(178, 18, 7, 0.05);
`;

const DistributionSection = styled.div`
  margin-bottom: 1rem;
`;

const PersonPane = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const PersonControls = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const DistributionHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
  flex-wrap: wrap;
`;

const DistributionHint = styled.p`
  margin: 0;
  color: #a0a0a0;
  font-size: 0.813rem;
`;

const DistributionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.6rem;
`;

const DistributionCard = styled.button<{ $active: boolean }>`
  ${scheduleInset};
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.3rem;
  padding: 0.8rem 0.9rem;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.12s ease, background 0.12s ease;
  border-color: ${(props) =>
    props.$active ? "rgba(178, 18, 7, 0.2)" : "#e4e4e4"};
  background: ${(props) =>
    props.$active ? "rgba(178, 18, 7, 0.05)" : "#f5f5f5"};

  &:hover {
    border-color: rgba(178, 18, 7, 0.2);
  }
`;

const DistributionName = styled.span`
  font-size: 0.813rem;
  font-weight: 700;
  color: #111111;
`;

const DistributionValue = styled.span`
  font-size: 1.25rem;
  font-weight: 800;
  color: #111111;
`;

const DistributionMeta = styled.span`
  ${scheduleLabel};
`;

const TableWrapper = styled.div`
  border: 1px solid #e4e4e4;
  border-radius: 8px;
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  ${scheduleLabel};
  text-align: left;
  padding: 0.75rem 1rem;
  background: #f8f8f8;
  border-bottom: 1px solid #e4e4e4;
`;

const Tr = styled.tr`
  &:not(:last-child) td {
    border-bottom: 1px solid #f0f0f0;
  }

  &:hover td {
    background: #fafafa;
  }
`;

const Td = styled.td`
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
`;

const TdTime = styled(Td)`
  font-weight: 600;
  color: #6b6b6b;
  width: 100px;
  white-space: nowrap;
`;

const TdCandidate = styled(Td)`
  font-weight: 600;
  color: #111111;
`;

const PanelList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
`;

const InterviewerBadge = styled.span<{ $isOvertime: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: ${(props) =>
    props.$isOvertime ? "rgba(178, 18, 7, 0.08)" : "#f0f0f0"};
  border: 1px solid
    ${(props) =>
      props.$isOvertime ? "rgba(178, 18, 7, 0.2)" : "#e4e4e4"};
  color: ${(props) => (props.$isOvertime ? "#b21207" : "#4b4b4b")};
  font-size: 0.75rem;
  font-weight: 600;
`;

const EmptyState = styled.div`
  ${scheduleInset};
  padding: 1rem;
  color: #6b6b6b;
  font-size: 0.875rem;
  font-weight: 600;
  text-align: center;
`;

const ResultFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-top: 0.875rem;
  margin-top: 0.875rem;
  border-top: 1px solid #e4e4e4;
  flex-wrap: wrap;
`;

const ActionGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
  flex-wrap: wrap;
`;

const ExportButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.9rem;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  background: #ffffff;
  color: #4b4b4b;
  font-size: 0.813rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;

  &:hover {
    border-color: #c8c8c8;
    background: #f8f8f8;
  }
`;

const SecondaryBtn = styled.button`
  padding: 0.45rem 0.9rem;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  background: #ffffff;
  color: #4b4b4b;
  font-size: 0.813rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.12s ease;

  &:hover:not(:disabled) {
    border-color: #c8c8c8;
    background: #f8f8f8;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DistributeButton = styled.button`
  ${primaryAction};
  padding: 0.45rem 1rem;
  border-radius: 8px;
  font-size: 0.813rem;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DistributedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.7rem;
  border-radius: 999px;
  background: rgba(22, 160, 88, 0.08);
  border: 1px solid rgba(22, 160, 88, 0.2);
  color: #0f8a4a;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const SaveErrorMsg = styled.span`
  font-size: 0.75rem;
  font-weight: 600;
  color: #b21207;
`;
