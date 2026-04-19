import React, { useMemo, useState } from "react";
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
  primaryActionClass,
  scheduleBadgeClass,
  scheduleInputClass,
  scheduleInsetClass,
  scheduleLabelClass,
  scheduleSurfaceClass,
} from "../shared";
import { formatDateHeader, generateIcs } from "../scheduleUtils";
import { useSavedSchedule } from "../../../query/hooks";
import cn from "src/utils/cn";

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

  const selectedPriorityMeta = useMemo(
    () =>
      PRIORITY_PRESETS.find((preset) => preset.key === selectedPriorityPreset) ??
      null,
    [selectedPriorityPreset],
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

          <ToggleRow>
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
          </ToggleRow>

          <PrioritySection>
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
              Velg hva som er viktigst når tilgjengelighet, kapasitet og jevn
              fordeling trekker i ulike retninger.
            </OptionHint>
            <PriorityPills>
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
                  {preset.label}
                </PriorityOption>
              ))}
            </PriorityPills>
            <PriorityCurrent>
              {selectedPriorityMeta ? (
                <>
                  <PriorityCurrentLabel>
                    {selectedPriorityMeta.label}
                  </PriorityCurrentLabel>
                  {selectedPriorityMeta.description}
                </>
              ) : (
                <>
                  <PriorityCurrentLabel>Tilpasset</PriorityCurrentLabel>
                  Du har manuelt valgt egne vekter for overtid og fordeling.
                </>
              )}
            </PriorityCurrent>
            <OptionDetails>
              <OptionSummary>
                <SummaryLabel>Forklaring og finjustering</SummaryLabel>
                <SummaryIcon />
              </OptionSummary>
              <OptionDetailsBody>
                Overtidsvekten sier hvor dyrt det er å bruke folk utenfor
                tilgjengeligheten sin. Fordelingsvekten sier hvor hardt
                solveren skal prøve å unngå at noen får klart flere intervjuer
                enn resten.
              </OptionDetailsBody>
              <ManualGrid>
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
              </ManualGrid>
            </OptionDetails>
          </PrioritySection>
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

const Container = ({ children }: React.PropsWithChildren) => (
  <div className="flex flex-col gap-3">{children}</div>
);

const MainCard = ({ children }: React.PropsWithChildren) => (
  <div className={cn(scheduleSurfaceClass, "p-5")}>{children}</div>
);

const Header = ({ children }: React.PropsWithChildren) => (
  <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
    {children}
  </div>
);

const TitleSection = ({ children }: React.PropsWithChildren) => (
  <div className="min-w-[200px] flex-1">{children}</div>
);

const Title = ({ children }: React.PropsWithChildren) => (
  <h2 className="m-0 mb-1 text-sm font-bold text-[#111111]">{children}</h2>
);

const Controls = ({ children }: React.PropsWithChildren) => (
  <div className="flex flex-wrap items-end gap-3">{children}</div>
);

const InputGroup = ({
  children,
  ...props
}: React.ComponentProps<"div">) => (
  <div className="flex flex-col gap-1" {...props}>
    {children}
  </div>
);

const Label = ({
  children,
  className,
  ...props
}: React.ComponentProps<"label">) => (
  <label className={cn(scheduleLabelClass, className)} {...props}>
    {children}
  </label>
);

const Input = ({ className, ...props }: React.ComponentProps<"input">) => (
  <input
    className={cn(scheduleInputClass, "w-16 text-center font-bold", className)}
    {...props}
  />
);

const RunButton = ({ children, className, ...props }: React.ComponentProps<"button">) => (
  <button
    className={cn(
      primaryActionClass,
      "cursor-pointer whitespace-nowrap px-[1.1rem] py-[0.55rem] text-[0.813rem] font-bold",
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

const StatRow = ({ children }: React.PropsWithChildren) => (
  <div className="mb-4 flex flex-wrap gap-4 border-b border-[#e4e4e4] pb-4">
    {children}
  </div>
);

const StatCard = ({ children }: React.PropsWithChildren) => (
  <div className="inline-flex items-baseline gap-[0.4rem]">{children}</div>
);

const StatLabel = ({ children }: React.PropsWithChildren) => (
  <span className={scheduleLabelClass}>{children}</span>
);

const StatValue = ({ children }: React.PropsWithChildren) => (
  <span className="text-sm font-bold text-[#111111]">{children}</span>
);

const OptionsPanel = ({ children }: React.PropsWithChildren) => (
  <div className={cn(scheduleInsetClass, "mb-4 flex flex-col gap-[0.9rem] p-4")}>
    {children}
  </div>
);

const OptionsIntro = ({ children }: React.PropsWithChildren) => (
  <div className="flex flex-col gap-[0.2rem]">{children}</div>
);

const OptionsLead = ({ children }: React.PropsWithChildren) => (
  <p className="m-0 max-w-[42rem] text-[0.813rem] leading-[1.55] text-[#6b6b6b]">
    {children}
  </p>
);

const ToggleRow = ({ children }: React.PropsWithChildren) => (
  <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[0.65rem]">
    {children}
  </div>
);

interface ToggleActiveProps {
  $active: boolean;
}

const ToggleCard = ({
  children,
  $active,
  className,
  ...props
}: React.ComponentProps<"div"> & ToggleActiveProps) => (
  <div
    className={cn(
      "flex cursor-pointer flex-col gap-[0.65rem] rounded-[10px] border px-[0.95rem] py-[0.85rem] transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-[rgba(178,18,7,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(178,18,7,0.25)]",
      $active
        ? "border-[rgba(178,18,7,0.22)] bg-[linear-gradient(180deg,rgba(178,18,7,0.05)_0%,rgba(255,255,255,0.92)_100%)] shadow-[0_8px_18px_rgba(178,18,7,0.06)]"
        : "border-[#e4e4e4] bg-[rgba(255,255,255,0.9)]",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

const PrioritySection = ({ children }: React.PropsWithChildren) => (
  <div className="flex flex-col gap-[0.65rem] pt-[0.15rem]">{children}</div>
);

const OptionHeader = ({ children }: React.PropsWithChildren) => (
  <div className="flex items-center justify-between gap-[0.3rem]">{children}</div>
);

const OptionEyebrow = ({ children }: React.PropsWithChildren) => (
  <span className={scheduleLabelClass}>{children}</span>
);

const OptionTitle = ({ children }: React.PropsWithChildren) => (
  <h4 className="m-0 text-sm font-bold text-[#111111]">{children}</h4>
);

const OptionHint = ({ children }: React.PropsWithChildren) => (
  <p className="m-0 text-[0.79rem] leading-[1.45] text-[#6b6b6b]">{children}</p>
);

const ToggleState = ({ children, $active }: React.PropsWithChildren<ToggleActiveProps>) => (
  <span
    className={cn(
      "flex min-w-12 items-center justify-center rounded-full px-[0.6rem] py-1 text-xs font-bold uppercase tracking-[0.04em]",
      $active
        ? "bg-[rgba(178,18,7,0.12)] text-[#b21207]"
        : "bg-[#f0f0f0] text-[#6b6b6b]",
    )}
  >
    {children}
  </span>
);

const PriorityBadge = ({ children }: React.PropsWithChildren) => (
  <span className="flex min-w-12 items-center justify-center rounded-full bg-[rgba(17,17,17,0.05)] px-[0.6rem] py-1 text-xs font-bold uppercase tracking-[0.04em] text-[#4b4b4b]">
    {children}
  </span>
);

const OptionDetails = ({
  children,
  className,
  ...props
}: React.ComponentProps<"details">) => (
  <details
    className={cn(
      "grid gap-[0.55rem] pt-[0.1rem] [&[open]_.summary-icon]:rotate-180",
      className,
    )}
    {...props}
  >
    {children}
  </details>
);

const OptionSummary = ({
  children,
  className,
  ...props
}: React.ComponentProps<"summary">) => (
  <summary
    className={cn(
      "inline-flex w-fit cursor-pointer list-none items-center gap-[0.35rem] text-[#6b6b6b] [&::-webkit-details-marker]:hidden",
      className,
    )}
    {...props}
  >
    {children}
  </summary>
);

const SummaryLabel = ({ children }: React.PropsWithChildren) => (
  <span className={cn(scheduleLabelClass, "tracking-[0.03em]")}>{children}</span>
);

const SummaryIcon = () => (
  <ChevronDown className="summary-icon h-[0.9rem] w-[0.9rem] transition-transform duration-150" />
);

const OptionDetailsBody = ({ children }: React.PropsWithChildren) => (
  <p className="m-0 text-[0.813rem] leading-[1.6] text-[#4b4b4b]">{children}</p>
);

const PriorityPills = ({ children }: React.PropsWithChildren) => (
  <div className="flex flex-wrap gap-[0.45rem]">{children}</div>
);

const PriorityOption = ({
  children,
  $active,
  className,
  ...props
}: React.ComponentProps<"button"> & ToggleActiveProps) => (
  <button
    className={cn(
      "inline-flex cursor-pointer items-center justify-center rounded-full border px-3 py-[0.45rem] text-[0.78rem] font-bold transition-[border-color,background] duration-150 hover:border-[rgba(178,18,7,0.18)]",
      $active
        ? "border-[rgba(178,18,7,0.22)] bg-[rgba(178,18,7,0.08)] text-[#b21207]"
        : "border-[#e4e4e4] bg-[rgba(255,255,255,0.72)] text-[#4b4b4b]",
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

const PriorityCurrent = ({ children }: React.PropsWithChildren) => (
  <p className="m-0 text-[0.8rem] leading-[1.5] text-[#4b4b4b]">{children}</p>
);

const PriorityCurrentLabel = ({ children }: React.PropsWithChildren) => (
  <span className="mr-[0.35rem] font-bold text-[#111111]">{children}</span>
);

const ManualGrid = ({ children }: React.PropsWithChildren) => (
  <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
    {children}
  </div>
);

const NumberInput = ({ className, ...props }: React.ComponentProps<"input">) => (
  <Input className={cn("w-full text-left font-semibold", className)} {...props} />
);

const ErrorMessage = ({ children }: React.PropsWithChildren) => (
  <div className="mb-3 rounded-lg border border-[rgba(178,18,7,0.14)] bg-[rgba(178,18,7,0.06)] px-4 py-3 text-[0.813rem] font-semibold text-[#b21207]">
    {children}
  </div>
);

const StatusBox = ({
  children,
  $type,
}: React.PropsWithChildren<{ $type: "error" | "success" }>) => (
  <div
    className={cn(
      scheduleInsetClass,
      "mb-3 px-5 py-8 text-center",
      $type === "error" && "border-[rgba(178,18,7,0.14)]",
    )}
  >
    {children}
  </div>
);

const StatusTitle = ({ children }: React.PropsWithChildren) => (
  <h4 className="m-0 mb-2 text-base font-bold text-[#111111]">{children}</h4>
);

const StatusDesc = ({ children }: React.PropsWithChildren) => (
  <p className="m-0 mx-auto max-w-[32rem] text-[0.813rem] leading-[1.7] text-[#a0a0a0]">
    {children}
  </p>
);

const ResultSection = ({ children }: React.PropsWithChildren) => (
  <div className="animate-[fade-in_0.25s_ease-out]">
    {children}
  </div>
);

const SectionHeader = ({ children }: React.PropsWithChildren) => (
  <div className="mb-[0.875rem] flex flex-wrap items-center justify-between gap-3">
    {children}
  </div>
);

const SectionTitleWrapper = ({ children }: React.PropsWithChildren) => (
  <div className="flex flex-wrap items-center gap-[0.65rem]">{children}</div>
);

const SectionEyebrow = ({ children }: React.PropsWithChildren) => (
  <span className={cn(scheduleLabelClass, "mb-[0.2rem] block")}>{children}</span>
);

const FilterGroup = InputGroup;

const FilterSelect = ({
  children,
  className,
  ...props
}: React.ComponentProps<"select">) => (
  <select
    className={cn(scheduleInputClass, "min-w-56 font-semibold", className)}
    {...props}
  >
    {children}
  </select>
);

const ViewToggle = ({ children }: React.PropsWithChildren) => (
  <div className="flex gap-[3px] rounded-lg border border-[#e4e4e4] bg-[#f5f5f5] p-[3px]">
    {children}
  </div>
);

const ToggleButton = ({
  children,
  $active,
  className,
  ...props
}: React.ComponentProps<"button"> & ToggleActiveProps) => (
  <button
    className={cn(
      "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border transition-all duration-100 hover:text-[#111111]",
      $active
        ? "border-[#e4e4e4] bg-white text-[#111111]"
        : "border-transparent bg-transparent text-[#a0a0a0]",
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

const ToggleLabelButton = ({
  children,
  ...props
}: React.ComponentProps<"button"> & ToggleActiveProps) => (
  <ToggleButton className="w-auto px-3 text-xs font-bold" {...props}>
    {children}
  </ToggleButton>
);

const SectionTitle = ({ children }: React.PropsWithChildren) => (
  <h3 className="m-0 text-sm font-bold text-[#111111]">{children}</h3>
);

const StatsBadge = ({ children }: React.PropsWithChildren) => (
  <span
    className={cn(
      scheduleBadgeClass,
      "border-[rgba(178,18,7,0.14)] bg-[rgba(178,18,7,0.05)] text-[#b21207]",
    )}
  >
    {children}
  </span>
);

const DistributionSection = ({ children }: React.PropsWithChildren) => (
  <div className="mb-4">{children}</div>
);

const PersonPane = ({ children }: React.PropsWithChildren) => (
  <div className="flex flex-col gap-4">{children}</div>
);

const PersonControls = ({ children }: React.PropsWithChildren) => (
  <div className="flex justify-end">{children}</div>
);

const DistributionHeader = ({ children }: React.PropsWithChildren) => (
  <div className="mb-[0.6rem] flex flex-wrap items-baseline justify-between gap-3">
    {children}
  </div>
);

const DistributionHint = ({ children }: React.PropsWithChildren) => (
  <p className="m-0 text-[0.813rem] text-[#a0a0a0]">{children}</p>
);

const DistributionGrid = ({ children }: React.PropsWithChildren) => (
  <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-[0.6rem]">
    {children}
  </div>
);

const DistributionCard = ({
  children,
  $active,
  className,
  ...props
}: React.ComponentProps<"button"> & ToggleActiveProps) => (
  <button
    className={cn(
      scheduleInsetClass,
      "flex cursor-pointer flex-col items-start gap-[0.3rem] px-[0.9rem] py-[0.8rem] text-left transition-[border-color,background] duration-100 hover:border-[rgba(178,18,7,0.2)]",
      $active
        ? "border-[rgba(178,18,7,0.2)] bg-[rgba(178,18,7,0.05)]"
        : "border-[#e4e4e4] bg-[#f5f5f5]",
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

const DistributionName = ({ children }: React.PropsWithChildren) => (
  <span className="text-[0.813rem] font-bold text-[#111111]">{children}</span>
);

const DistributionValue = ({ children }: React.PropsWithChildren) => (
  <span className="text-xl font-extrabold text-[#111111]">{children}</span>
);

const DistributionMeta = ({ children }: React.PropsWithChildren) => (
  <span className={scheduleLabelClass}>{children}</span>
);

const TableWrapper = ({ children }: React.PropsWithChildren) => (
  <div className="overflow-hidden rounded-lg border border-[#e4e4e4]">
    {children}
  </div>
);

const Table = ({ children }: React.PropsWithChildren) => (
  <table className="w-full border-collapse">{children}</table>
);

const Th = ({ children }: React.PropsWithChildren) => (
  <th
    className={cn(
      scheduleLabelClass,
      "border-b border-[#e4e4e4] bg-[#f8f8f8] px-4 py-3 text-left",
    )}
  >
    {children}
  </th>
);

const Tr = ({ children }: React.PropsWithChildren) => (
  <tr className="group [&:not(:last-child)>td]:border-b [&:not(:last-child)>td]:border-b-[#f0f0f0] hover:[&>td]:bg-[#fafafa]">
    {children}
  </tr>
);

const Td = ({ children, className }: React.PropsWithChildren<{ className?: string }>) => (
  <td className={cn("px-4 py-3 text-sm", className)}>{children}</td>
);

const TdTime = ({ children }: React.PropsWithChildren) => (
  <Td className="w-[100px] whitespace-nowrap font-semibold text-[#6b6b6b]">
    {children}
  </Td>
);

const TdCandidate = ({ children }: React.PropsWithChildren) => (
  <Td className="font-semibold text-[#111111]">{children}</Td>
);

const PanelList = ({ children }: React.PropsWithChildren) => (
  <div className="flex flex-wrap gap-[0.35rem]">{children}</div>
);

const InterviewerBadge = ({
  children,
  $isOvertime,
  ...props
}: React.PropsWithChildren<{ $isOvertime: boolean } & React.ComponentProps<"span">>) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full border px-[0.55rem] py-[0.2rem] text-xs font-semibold",
      $isOvertime
        ? "border-[rgba(178,18,7,0.2)] bg-[rgba(178,18,7,0.08)] text-[#b21207]"
        : "border-[#e4e4e4] bg-[#f0f0f0] text-[#4b4b4b]",
    )}
    {...props}
  >
    {children}
  </span>
);

const EmptyState = ({ children }: React.PropsWithChildren) => (
  <div
    className={cn(
      scheduleInsetClass,
      "p-4 text-center text-sm font-semibold text-[#6b6b6b]",
    )}
  >
    {children}
  </div>
);

const ResultFooter = ({ children }: React.PropsWithChildren) => (
  <div className="mt-[0.875rem] flex flex-wrap items-center gap-3 border-t border-[#e4e4e4] pt-[0.875rem]">
    {children}
  </div>
);

const ActionGroup = ({ children }: React.PropsWithChildren) => (
  <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
);

const ExportButton = ({
  children,
  className,
  ...props
}: React.ComponentProps<"button">) => (
  <button
    className={cn(
      "inline-flex cursor-pointer items-center gap-[0.4rem] rounded-lg border border-[#e0e0e0] bg-white px-[0.9rem] py-[0.45rem] text-[0.813rem] font-semibold text-[#4b4b4b] transition-[border-color,background] duration-100 hover:border-[#c8c8c8] hover:bg-[#f8f8f8]",
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

const SecondaryBtn = ({
  children,
  className,
  ...props
}: React.ComponentProps<"button">) => (
  <button
    className={cn(
      "cursor-pointer rounded-lg border border-[#e0e0e0] bg-white px-[0.9rem] py-[0.45rem] text-[0.813rem] font-semibold text-[#4b4b4b] transition-[border-color,background] duration-100 hover:border-[#c8c8c8] hover:bg-[#f8f8f8] disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

const DistributeButton = ({
  children,
  className,
  ...props
}: React.ComponentProps<"button">) => (
  <button
    className={cn(
      primaryActionClass,
      "cursor-pointer px-4 py-[0.45rem] text-[0.813rem] font-bold disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

const DistributedBadge = ({ children }: React.PropsWithChildren) => (
  <span className="inline-flex items-center rounded-full border border-[rgba(22,160,88,0.2)] bg-[rgba(22,160,88,0.08)] px-[0.7rem] py-[0.25rem] text-xs font-bold uppercase tracking-[0.04em] text-[#0f8a4a]">
    {children}
  </span>
);

const SaveErrorMsg = ({ children }: React.PropsWithChildren) => (
  <span className="text-xs font-semibold text-[#b21207]">{children}</span>
);
