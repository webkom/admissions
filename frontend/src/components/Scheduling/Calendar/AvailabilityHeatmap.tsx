import React, { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Interviewer } from "../types";
import {
  buildBlockTimeChunks,
  decodeScheduleTime,
  formatDateHeader,
  formatMinutes,
  makeSlotKey,
} from "../scheduleUtils";
import cn from "src/utils/cn";
import { iconSizes } from "src/styles/designTokens";
import {
  CustomSelect,
  SchedulePanel,
  SchedulePanelBody,
  SchedulePanelFooter,
  SchedulePanelHeader,
} from "../ui";
import {
  ScheduleBlockCell,
  ScheduleDayHeader,
  ScheduleGridLegendItem,
  ScheduleSlotSegments,
  ScheduleTimeLabel,
} from "./ScheduleGridFrame";
import ScheduleCalendarGrid from "./ScheduleCalendarGrid";
import {
  buildAvailabilityCoverage,
  type BlockCoverage,
} from "./availabilityCoverage";

interface AvailabilityHeatmapProps {
  interviewers: Interviewer[];
  availableSlots: Set<string>;
  panelSize: number;
  samePanelPerBlock: boolean;
  dates: string[];
  dayStartMinute?: number;
  dayEndMinute?: number;
  sessionDuration: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  onParticipationChange?: (
    userId: string,
    participation: "awaiting_response" | "not_participating",
  ) => Promise<void>;
}

interface AvailabilityBlock {
  date: string;
  chunkIndex: number;
  minutes: number[];
  enabledMinutes: number[];
  coverage: BlockCoverage;
  allAvailableInterviewers: Interviewer[];
}

type GenderFilter = "all" | "male" | "female";

const genderOptions = [
  { value: "all", label: "Alle" },
  { value: "male", label: "Menn" },
  { value: "female", label: "Kvinner" },
];

const AvailabilityHeatmap: React.FC<AvailabilityHeatmapProps> = ({
  interviewers,
  availableSlots,
  panelSize,
  samePanelPerBlock,
  dates,
  dayStartMinute = 8 * 60,
  dayEndMinute = 18 * 60,
  sessionDuration,
  chunkSize,
  chunkBreakMinutes,
  onParticipationChange,
}) => {
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [highlightedInterviewer, setHighlightedInterviewer] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isResponseDisclosureOpen, setIsResponseDisclosureOpen] =
    useState(false);
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(null);
  const [participationSavingId, setParticipationSavingId] = useState("");
  const [pendingOptOutId, setPendingOptOutId] = useState("");
  const selectedBlockTriggerRef = useRef<HTMLElement | null>(null);
  const chunks = useMemo(
    () =>
      buildBlockTimeChunks({
        dayStartMinute,
        dayEndMinute,
        sessionDuration,
        chunkSize,
        chunkBreakMinutes,
      }),
    [
      chunkBreakMinutes,
      chunkSize,
      dayEndMinute,
      dayStartMinute,
      sessionDuration,
    ],
  );
  const interviewerSlots = useMemo(
    () =>
      new Map(
        interviewers.map((interviewer) => [
          interviewer.id,
          new Set(
            interviewer.availability.flatMap((time) => {
              const { dayIndex, minute } = decodeScheduleTime(
                time,
                sessionDuration,
              );
              const date = dates[dayIndex];
              return date ? [makeSlotKey(date, minute)] : [];
            }),
          ),
        ]),
      ),
    [dates, interviewers, sessionDuration],
  );
  const participatingInterviewers = useMemo(
    () =>
      interviewers.filter(
        (interviewer) =>
          interviewer.participation === "participating" ||
          (interviewer.participation === undefined &&
            interviewer.has_submitted),
      ),
    [interviewers],
  );
  const missingResponse = useMemo(
    () =>
      interviewers.filter(
        (interviewer) =>
          interviewer.participation === "awaiting_response" ||
          (interviewer.participation === undefined &&
            !interviewer.has_submitted),
      ),
    [interviewers],
  );
  const optedOut = useMemo(
    () =>
      interviewers.filter(
        (interviewer) => interviewer.participation === "not_participating",
      ),
    [interviewers],
  );
  const inspectedInterviewers = useMemo(
    () =>
      genderFilter === "male"
        ? participatingInterviewers.filter(
            (interviewer) => interviewer.gender === "M",
          )
        : genderFilter === "female"
          ? participatingInterviewers.filter(
              (interviewer) => interviewer.gender === "F",
            )
          : participatingInterviewers,
    [genderFilter, participatingInterviewers],
  );
  const submitted = useMemo(
    () =>
      participatingInterviewers.filter(
        (interviewer) => interviewer.has_submitted,
      ),
    [participatingInterviewers],
  );
  const respondentsInScope = useMemo(
    () =>
      inspectedInterviewers.filter((interviewer) => interviewer.has_submitted),
    [inspectedInterviewers],
  );
  const globalCoverage = useMemo(
    () =>
      buildAvailabilityCoverage({
        interviewers: submitted,
        availableSlots,
        dates,
        chunks,
        sessionDuration,
        panelSize,
        samePanelPerBlock,
      }),
    [
      availableSlots,
      chunks,
      dates,
      panelSize,
      samePanelPerBlock,
      sessionDuration,
      submitted,
    ],
  );
  const inspectionCoverage = useMemo(
    () =>
      buildAvailabilityCoverage({
        interviewers: respondentsInScope,
        availableSlots,
        dates,
        chunks,
        sessionDuration,
        panelSize,
        samePanelPerBlock,
      }),
    [
      availableSlots,
      chunks,
      dates,
      panelSize,
      respondentsInScope,
      samePanelPerBlock,
      sessionDuration,
    ],
  );
  const blocks = useMemo<AvailabilityBlock[]>(
    () =>
      inspectionCoverage.blocks.map((coverage) => {
        const { date, minutes, enabledMinutes } = coverage;
        const allAvailableInterviewers =
          enabledMinutes.length === 0
            ? []
            : submitted.filter((interviewer) =>
                enabledMinutes.every((minute) =>
                  interviewerSlots
                    .get(interviewer.id)
                    ?.has(makeSlotKey(date, minute)),
                ),
              );
        return {
          date,
          chunkIndex: coverage.chunkIndex,
          minutes,
          enabledMinutes,
          coverage,
          allAvailableInterviewers,
        };
      }),
    [inspectionCoverage.blocks, interviewerSlots, submitted],
  );
  const blocksByKey = useMemo(
    () =>
      new Map(
        blocks.map((block) => [`${block.date}|${block.chunkIndex}`, block]),
      ),
    [blocks],
  );
  const selectedBlock = selectedBlockKey
    ? blocksByKey.get(selectedBlockKey)
    : undefined;
  const selectedInterviewer = interviewers.find(
    (interviewer) => interviewer.id === highlightedInterviewer,
  );
  const isHighlighted = (block: AvailabilityBlock) =>
    Boolean(
      selectedInterviewer &&
        selectedInterviewer.has_submitted &&
        block.enabledMinutes.length > 0 &&
        block.enabledMinutes.every((minute) =>
          interviewerSlots
            .get(selectedInterviewer.id)
            ?.has(makeSlotKey(block.date, minute)),
        ),
    );
  const closeBlockDetail = () => {
    setSelectedBlockKey(null);
    window.requestAnimationFrame(() =>
      selectedBlockTriggerRef.current?.focus(),
    );
  };
  const changeParticipation = async (
    interviewer: Interviewer,
    participation: "awaiting_response" | "not_participating",
  ) => {
    if (!onParticipationChange) return;
    setParticipationSavingId(interviewer.id);
    try {
      await onParticipationChange(interviewer.id, participation);
      if (participation === "not_participating") {
        setPendingOptOutId("");
      }
    } finally {
      setParticipationSavingId("");
    }
  };
  const optOutControl = (interviewer: Interviewer) => (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {pendingOptOutId === interviewer.id ? (
        <>
          <span className="text-right text-detail text-text-muted">
            {(interviewer.affected_assignment_count ?? 0) > 0
              ? `${interviewer.affected_assignment_count} planlagte intervju må repareres.`
              : "Intervjueren fjernes fra planleggingen."}
          </span>
          <button
            type="button"
            disabled={participationSavingId === interviewer.id}
            onClick={() => setPendingOptOutId("")}
            className="text-detail font-semibold text-text-muted hover:underline disabled:opacity-50"
          >
            Avbryt
          </button>
          <button
            type="button"
            disabled={participationSavingId === interviewer.id}
            onClick={() =>
              void changeParticipation(interviewer, "not_participating")
            }
            className="text-detail font-semibold text-danger hover:underline disabled:opacity-50"
          >
            Bekreft
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={participationSavingId === interviewer.id}
          onClick={() => setPendingOptOutId(interviewer.id)}
          className="text-detail font-semibold text-brand hover:underline disabled:opacity-50"
        >
          Deltar ikke
        </button>
      )}
    </div>
  );

  return (
    <SchedulePanel className="min-w-0">
      <SchedulePanelHeader
        icon={BarChart3}
        title="Tilgjengelighetsoversikt"
        description="Se hvem som deltar, og om dere har nok felles kapasitet til intervjuene."
        actions={
          <ResponseStatus
            missingResponse={missingResponse}
            optedOut={optedOut}
            canManage={Boolean(onParticipationChange)}
            isOpen={isResponseDisclosureOpen}
            onToggle={() => setIsResponseDisclosureOpen((open) => !open)}
          />
        }
      />
      <SchedulePanelBody className="flex flex-col gap-4">
        {isResponseDisclosureOpen &&
          (missingResponse.length > 0 ||
            optedOut.length > 0 ||
            Boolean(onParticipationChange)) && (
            <section
              className="rounded-md border border-border-soft bg-surface-subtle px-3 py-2"
              aria-label="Deltakelse"
            >
              <div className="divide-y divide-border-soft">
                {missingResponse.map((interviewer) => (
                  <div
                    key={interviewer.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0"
                  >
                    <div className="text-detail">
                      <strong className="text-text-primary">
                        {interviewer.name}
                      </strong>
                      <span className="ml-2 text-text-muted">Mangler svar</span>
                    </div>
                    {onParticipationChange && optOutControl(interviewer)}
                  </div>
                ))}
                {onParticipationChange &&
                  participatingInterviewers.map((interviewer) => (
                    <div
                      key={interviewer.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div className="text-detail">
                        <strong className="text-text-primary">
                          {interviewer.name}
                        </strong>
                        <span className="ml-2 text-text-muted">Deltar</span>
                      </div>
                      {optOutControl(interviewer)}
                    </div>
                  ))}
                {optedOut.map((interviewer) => (
                  <div
                    key={interviewer.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 last:pb-0"
                  >
                    <div className="text-detail">
                      <strong className="text-text-primary">
                        {interviewer.name}
                      </strong>
                      <span className="ml-2 text-text-muted">Deltar ikke</span>
                    </div>
                    {onParticipationChange && (
                      <button
                        type="button"
                        disabled={participationSavingId === interviewer.id}
                        onClick={() =>
                          void changeParticipation(
                            interviewer,
                            "awaiting_response",
                          )
                        }
                        className="text-detail font-semibold text-brand hover:underline disabled:opacity-50"
                      >
                        Ta med igjen
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-end border-t border-border-soft pt-2">
                <button
                  type="button"
                  onClick={() => setIsResponseDisclosureOpen(false)}
                  className="text-detail font-semibold text-brand hover:underline"
                >
                  Skjul
                </button>
              </div>
            </section>
          )}

        <section
          aria-label="Oppsummering av intervjukapasitet"
          className="grid gap-px overflow-hidden rounded-md border border-border-soft bg-border-soft sm:grid-cols-3"
        >
          <CoverageMetric
            label="Svar mottatt"
            value={`${submitted.length}/${participatingInterviewers.length}`}
          />
          <CoverageMetric
            label="Åpne intervjutider"
            value={globalCoverage.openSlotCount}
          />
          <CoverageMetric
            label={`Intervjutider med fullt panel · panel på ${panelSize}`}
            value={globalCoverage.completeSlotCount}
          />
        </section>

        {participatingInterviewers.length < panelSize && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-ui font-semibold text-amber-900"
          >
            <AlertTriangle
              size={iconSizes.small}
              className="mt-0.5 flex-none"
              aria-hidden="true"
            />
            Panel på {panelSize} er ikke mulig med bare{" "}
            {participatingInterviewers.length} deltakende intervjuere. Reduser
            panelstørrelsen eller ta med flere.
          </div>
        )}

        <div className="border-y border-border-soft py-2">
          <button
            type="button"
            aria-expanded={isFilterOpen}
            aria-controls="availability-filters"
            onClick={() => setIsFilterOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 text-left text-ui font-semibold text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"
          >
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal size={iconSizes.small} aria-hidden="true" />
              Filtrer og fremhev
              {(genderFilter !== "all" || highlightedInterviewer) && (
                <span className="rounded bg-brand-soft px-1.5 py-0.5 text-label font-semibold text-brand">
                  Aktiv
                </span>
              )}
            </span>
            <ChevronDown
              size={iconSizes.small}
              aria-hidden="true"
              className={cn(
                "transition-transform",
                isFilterOpen && "rotate-180",
              )}
            />
          </button>
          {isFilterOpen && (
            <fieldset
              id="availability-filters"
              className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3 animate-fade-in"
            >
              <legend className="sr-only">Visning</legend>
              <label
                className="flex flex-col gap-1 text-detail font-medium text-text-muted"
                htmlFor="gender-filter"
              >
                Kjønn på intervjuere
                <CustomSelect
                  id="gender-filter"
                  value={genderFilter}
                  className="min-w-36"
                  onChange={(value) => setGenderFilter(value as GenderFilter)}
                  options={genderOptions}
                />
              </label>
              <label
                className="flex flex-col gap-1 text-detail font-medium text-text-muted"
                htmlFor="interviewer-highlight"
              >
                Fremhev intervjuer
                <CustomSelect
                  id="interviewer-highlight"
                  value={highlightedInterviewer}
                  className="min-w-44"
                  placeholder="Ingen"
                  onChange={setHighlightedInterviewer}
                  options={[
                    { value: "", label: "Ingen" },
                    ...participatingInterviewers.map((interviewer) => ({
                      value: interviewer.id,
                      label: interviewer.name,
                    })),
                  ]}
                />
              </label>
            </fieldset>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-detail text-text-muted">
          <span>
            Tallet viser tilgjengelige intervjuere mot panelstørrelsen. Strekene
            viser dekningen for hver intervjutid i blokken.
          </span>
          <div className="flex flex-wrap items-center gap-3 font-medium">
            <SegmentLegend label="Lav dekning" fill={0.33} />
            <SegmentLegend label="Full dekning" fill={1} />
            <ScheduleGridLegendItem
              label="Stengt"
              swatchClassName="border-border-soft bg-surface-neutral [background-image:var(--pattern-unavailable)]"
            />
          </div>
        </div>
        {genderFilter !== "all" && (
          <p className="m-0 text-detail text-text-muted">
            Viser {genderFilter === "male" ? "mannlige" : "kvinnelige"}{" "}
            intervjuere. {respondentsInScope.length} i utvalget har svart.
            Oppsummeringen over gjelder fortsatt alle intervjuere.
          </p>
        )}
        {selectedInterviewer && (
          <p className="m-0 text-detail text-text-muted">
            {selectedInterviewer.has_submitted
              ? `Fremhever ${selectedInterviewer.name}. Det endrer ikke antallet i rutene.`
              : `${selectedInterviewer.name} har ikke svart ennå. Dekningen er uendret.`}
          </p>
        )}

        <ScheduleCalendarGrid
          dates={dates}
          chunks={chunks}
          sessionDuration={sessionDuration}
          renderDayHeader={(date) => (
            <ScheduleDayHeader date={date} className="sticky top-0 z-10" />
          )}
          renderTimeLabel={({ chunk }) => (
            <ScheduleTimeLabel
              startMinute={chunk[0]}
              endMinute={chunk[chunk.length - 1] + sessionDuration}
              className="sticky left-0 z-10"
            />
          )}
          renderCell={({ date, chunkIndex }) => {
            const key = `${date}|${chunkIndex}`;
            const block = blocksByKey.get(key);
            if (!block) return <div key={key} />;
            const { weekday, dayMonth } = formatDateHeader(date);
            const count = block.coverage.availableCount;
            const closed = block.enabledMinutes.length === 0;
            const highlighted = isHighlighted(block);
            const label = closed
              ? `${weekday} ${dayMonth}: stengt`
              : `${weekday} ${dayMonth}: ${count} av ${panelSize} i paneldekning`;
            return (
              <ScheduleBlockCell
                key={key}
                data-coverage-status={block.coverage.status}
                role="button"
                tabIndex={closed ? -1 : 0}
                aria-label={
                  closed ? "Stengt" : `${label}. Vis hvem som er tilgjengelige.`
                }
                aria-pressed={closed ? undefined : selectedBlockKey === key}
                onClick={(event) => {
                  if (closed) return;
                  selectedBlockTriggerRef.current = event.currentTarget;
                  setSelectedBlockKey((current) =>
                    current === key ? null : key,
                  );
                }}
                onKeyDown={(event) => {
                  if (closed || (event.key !== "Enter" && event.key !== " "))
                    return;
                  event.preventDefault();
                  selectedBlockTriggerRef.current = event.currentTarget;
                  setSelectedBlockKey((current) =>
                    current === key ? null : key,
                  );
                }}
                closed={closed}
                className={cn(
                  "text-center text-lg tabular-nums",
                  !closed &&
                    "cursor-pointer hover:border-brand-border hover:bg-brand-soft",
                  !closed && count === 0 && "font-semibold text-text-muted",
                  !closed && count > 0 && "font-bold text-text-primary",
                  block.coverage.status === "complete" &&
                    "border-success-border bg-success-bg",
                  block.coverage.status === "partial" && "bg-brand-soft/45",
                  highlighted &&
                    !closed &&
                    "ring-2 ring-inset ring-brand-border",
                )}
              >
                <ScheduleSlotSegments
                  closed={closed}
                  fills={block.minutes.map((minute) => {
                    const slot = block.coverage.slotCoverage.find(
                      (candidate) => candidate.minute === minute,
                    );
                    return slot
                      ? Math.min(1, slot.availableCount / panelSize)
                      : 0;
                  })}
                />
                {!closed && (
                  <span>
                    {count}/{panelSize}
                  </span>
                )}
                {highlighted && (
                  <span
                    aria-label="Valgt intervjuer er tilgjengelig"
                    className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-brand"
                  />
                )}
              </ScheduleBlockCell>
            );
          }}
        />

        {selectedBlock && (
          <BlockDetail
            block={selectedBlock}
            interviewers={inspectedInterviewers}
            interviewerSlots={interviewerSlots}
            panelSize={panelSize}
            samePanelPerBlock={samePanelPerBlock}
            sessionDuration={sessionDuration}
            onClose={closeBlockDetail}
            missingResponse={missingResponse}
          />
        )}
      </SchedulePanelBody>
      <SchedulePanelFooter>
        <span className="text-detail text-text-muted">
          Klikk på en blokk for å se hvem som er tilgjengelige.
        </span>
        <span className="text-detail font-medium tabular-nums text-text-muted">
          {globalCoverage.completeBlockCount} av {globalCoverage.openBlockCount}{" "}
          blokker har full paneldekning
        </span>
      </SchedulePanelFooter>
    </SchedulePanel>
  );
};

const SegmentLegend: React.FC<{ label: string; fill: number }> = ({
  label,
  fill,
}) => (
  <span className="inline-flex items-center gap-1.5 text-detail font-medium text-text-muted">
    <span className="w-7">
      <ScheduleSlotSegments fills={[fill]} />
    </span>
    {label}
  </span>
);

const CoverageMetric: React.FC<{
  label: string;
  value: string | number;
}> = ({ label, value }) => (
  <div className="bg-surface-base px-3 py-2.5">
    <span className="block text-nano font-semibold uppercase tracking-wide text-text-muted">
      {label}
    </span>
    <strong className="mt-0.5 block text-lg tabular-nums text-text-primary">
      {value}
    </strong>
  </div>
);

const ResponseStatus: React.FC<{
  missingResponse: Interviewer[];
  optedOut: Interviewer[];
  canManage: boolean;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ missingResponse, optedOut, canManage, isOpen, onToggle }) =>
  missingResponse.length === 0 && optedOut.length === 0 && !canManage ? (
    <span className="inline-flex items-center gap-1 text-detail font-semibold text-success">
      <Check size={iconSizes.compact} aria-hidden="true" /> Alle er avklart
    </span>
  ) : (
    <button
      type="button"
      aria-expanded={isOpen}
      className="text-detail font-semibold text-brand hover:text-brand-dark hover:underline"
      onClick={onToggle}
    >
      {missingResponse.length > 0
        ? `${missingResponse.length} mangler svar ›`
        : optedOut.length > 0
          ? `${optedOut.length} deltar ikke ›`
          : "Alle er avklart · administrer ›"}
    </button>
  );

const BlockDetail: React.FC<{
  block: AvailabilityBlock;
  interviewers: Interviewer[];
  interviewerSlots: Map<string, Set<string>>;
  panelSize: number;
  samePanelPerBlock: boolean;
  sessionDuration: number;
  onClose: () => void;
  missingResponse: Interviewer[];
}> = ({
  block,
  interviewers,
  interviewerSlots,
  panelSize,
  samePanelPerBlock,
  sessionDuration,
  onClose,
  missingResponse,
}) => {
  const { weekday, dayMonth } = formatDateHeader(block.date);
  const availableIds = new Set(
    block.allAvailableInterviewers.map((interviewer) => interviewer.id),
  );
  const available = interviewers.filter(
    (interviewer) =>
      interviewer.has_submitted && availableIds.has(interviewer.id),
  );
  const unavailable = interviewers.filter(
    (interviewer) =>
      interviewer.has_submitted && !availableIds.has(interviewer.id),
  );
  return (
    <section
      aria-label="Tilgjengelighet for valgt tidsblokk"
      className="rounded-md border border-border-soft bg-surface-subtle px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-ui font-bold text-text-primary">
            {weekday} {dayMonth} · {formatMinutes(block.minutes[0])}–
            {formatMinutes(
              block.minutes[block.minutes.length - 1] + sessionDuration,
            )}
          </h3>
          <p className="m-0 mt-1 text-detail text-text-muted">
            {block.enabledMinutes.length === 0
              ? "Denne blokken er stengt."
              : samePanelPerBlock
                ? `${block.coverage.availableCount} av ${panelSize} kan danne samme panel gjennom hele blokken.`
                : `${block.coverage.availableCount} av ${panelSize} er laveste paneldekning i blokkens intervjutider.`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-text-muted hover:bg-surface-neutral hover:text-text-primary"
          aria-label="Lukk detaljer"
        >
          <X size={iconSizes.small} aria-hidden="true" />
        </button>
      </div>
      {block.enabledMinutes.length > 0 && (
        <>
          <div className="mt-3 divide-y divide-border-soft border-y border-border-soft">
            {block.enabledMinutes.map((minute) => {
              const availableAtTime = interviewers.filter(
                (interviewer) =>
                  interviewer.has_submitted &&
                  interviewerSlots
                    .get(interviewer.id)
                    ?.has(makeSlotKey(block.date, minute)),
              );
              return (
                <div
                  key={minute}
                  className="grid gap-1 py-2 text-detail sm:grid-cols-[5rem_5rem_1fr] sm:items-baseline"
                >
                  <strong className="tabular-nums text-text-primary">
                    {formatMinutes(minute)}
                  </strong>
                  <span className="font-semibold tabular-nums text-text-muted">
                    {availableAtTime.length}/{panelSize}
                  </span>
                  <span className="text-text-muted">
                    {availableAtTime.length > 0
                      ? availableAtTime
                          .map((interviewer) => interviewer.name)
                          .join(" · ")
                      : "Ingen tilgjengelige"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <PersonList title="Hele blokken" people={available} />
            <PersonList title="Ikke hele blokken" people={unavailable} />
            <PersonList title="Ikke svart" people={missingResponse} />
          </div>
        </>
      )}
    </section>
  );
};

const PersonList: React.FC<{ title: string; people: Interviewer[] }> = ({
  title,
  people,
}) => (
  <div>
    <h4 className="m-0 text-detail font-bold text-text-primary">
      {title} ({people.length})
    </h4>
    {people.length > 0 ? (
      <ul className="m-0 mt-1 list-none p-0 text-detail text-text-muted">
        {people.map((person) => (
          <li key={person.id} className="border-b border-border-soft py-1">
            {person.name}
          </li>
        ))}
      </ul>
    ) : (
      <p className="m-0 mt-1 text-detail text-text-muted">Ingen</p>
    )}
  </div>
);

export default AvailabilityHeatmap;
