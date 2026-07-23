import React, { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { ExperienceLevel, Interviewer } from "../types";
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
  onExperienceLevelChange?: (
    userId: string,
    experienceLevel: ExperienceLevel,
  ) => Promise<void>;
}

interface AvailabilityBlock {
  date: string;
  chunkIndex: number;
  minutes: number[];
  enabledMinutes: number[];
  coverage: BlockCoverage;
  heatmapAvailableCount: number;
  allAvailableInterviewers: Interviewer[];
}

type GenderFilter = "all" | "male" | "female";

const genderOptions = [
  { value: "all", label: "Alle" },
  { value: "male", label: "Menn" },
  { value: "female", label: "Kvinner" },
];

const heatmapCellStyle = (
  availableCount: number,
  heatmapCapacity: number,
): React.CSSProperties => {
  if (heatmapCapacity <= 0) return {};

  const normalizedCapacity = Math.max(heatmapCapacity, 1);
  const ratio = Math.min(availableCount / normalizedCapacity, 1);
  const oneSeventh = 1 / 7;
  const threeSeventh = 3 / 7;
  const redShare = ratio <= oneSeventh ? 18 : ratio <= threeSeventh ? 42 : 78;

  return {
    backgroundColor: `color-mix(in srgb, var(--color-red-6) ${redShare}%, var(--color-surface-base))`,
    borderColor: `color-mix(in srgb, var(--color-red-6) ${Math.min(redShare + 30, 95)}%, var(--color-border-soft))`,
  };
};

const formatHeatmapAvailability = (
  availableCount: number,
  heatmapCapacity: number,
): string =>
  heatmapCapacity > 0
    ? `${availableCount}/${heatmapCapacity}`
    : `${availableCount}`;

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
  onExperienceLevelChange,
}) => {
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [highlightedInterviewer, setHighlightedInterviewer] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isResponseDisclosureOpen, setIsResponseDisclosureOpen] =
    useState(false);
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(null);
  const [participationSavingId, setParticipationSavingId] = useState("");
  const [experienceSavingId, setExperienceSavingId] = useState("");
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
  const heatmapCapacity = respondentsInScope.length;
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
        const heatmapAvailableCount = respondentsInScope.filter((interviewer) =>
          minutes.some((minute) =>
            interviewerSlots
              .get(interviewer.id)
              ?.has(makeSlotKey(date, minute)),
          ),
        ).length;
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
          heatmapAvailableCount,
          allAvailableInterviewers,
        };
      }),
    [
      inspectionCoverage.blocks,
      interviewerSlots,
      respondentsInScope,
      submitted,
    ],
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
  const experienceControl = (interviewer: Interviewer) =>
    onExperienceLevelChange ? (
      <label className="flex items-center gap-2 text-detail text-text-muted">
        Erfaring
        <CustomSelect
          value={interviewer.experience_level ?? "unknown"}
          disabled={experienceSavingId === interviewer.id}
          className="min-w-36"
          aria-label={`Erfaringsnivå for ${interviewer.name}`}
          onChange={(value) => {
            setExperienceSavingId(interviewer.id);
            void onExperienceLevelChange(
              interviewer.id,
              value as ExperienceLevel,
            ).finally(() => setExperienceSavingId(""));
          }}
          options={[
            { value: "unknown", label: "Ikke klassifisert" },
            { value: "inexperienced", label: "Uerfaren" },
            { value: "experienced", label: "Erfaren" },
          ]}
        />
      </label>
    ) : null;

  return (
    <SchedulePanel className="min-w-0">
      <SchedulePanelHeader
        icon={BarChart3}
        title="Tilgjengelighetsoversikt"
        description="Se hvem som deltar, og hvor mange som er tilgjengelige i hver intervjublokk."
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
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      {experienceControl(interviewer)}
                      {onParticipationChange && optOutControl(interviewer)}
                    </div>
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
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        {experienceControl(interviewer)}
                        {optOutControl(interviewer)}
                      </div>
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
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      {experienceControl(interviewer)}
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
            Fargen viser hvor mange intervjuere som er tilgjengelige i minst én
            av blokkens ordinære intervjutider. Den påvirkes ikke av
            panelstørrelse eller finjusterte åpne tider.
          </span>
          <div className="flex flex-wrap items-center gap-3 font-medium">
            <div
              className="h-2.5 w-44 rounded-sm border border-border-soft"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, color-mix(in srgb, var(--color-red-6) 18%, var(--color-surface-base)) 0%, color-mix(in srgb, var(--color-red-6) 42%, var(--color-surface-base)) 45%, color-mix(in srgb, var(--color-red-6) 78%, var(--color-surface-base)) 100%)",
              }}
              aria-hidden="true"
            />
            <div className="flex items-center gap-2 text-label text-text-muted">
              <span>1 tilgjengelig</span>
              <span>3 tilgjengelige</span>
              <span>6+ tilgjengelige</span>
            </div>
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
            const count = block.heatmapAvailableCount;
            const closed = block.enabledMinutes.length === 0;
            const highlighted = isHighlighted(block);
            const availabilityText = formatHeatmapAvailability(
              count,
              heatmapCapacity,
            );
            const label = closed
              ? `${weekday} ${dayMonth}: stengt`
              : `${weekday} ${dayMonth}: ${availabilityText} tilgjengelige intervjuere`;
            return (
              <ScheduleBlockCell
                key={key}
                data-coverage-status={block.coverage.status}
                data-availability-count={count}
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
                style={
                  closed
                    ? undefined
                    : heatmapCellStyle(count, Math.max(heatmapCapacity, 1))
                }
                className={cn(
                  "text-center text-lg tabular-nums",
                  !closed &&
                    "cursor-pointer hover:border-danger-border hover:shadow-sm",
                  !closed && count === 0 && "font-semibold text-text-muted",
                  !closed && count > 0 && "font-bold text-text-primary",
                  highlighted &&
                    !closed &&
                    "ring-2 ring-inset ring-brand-border",
                )}
              >
                {!closed && <span>{availabilityText}</span>}
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
          Mørkere farge betyr flere tilgjengelige intervjuere
        </span>
      </SchedulePanelFooter>
    </SchedulePanel>
  );
};

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
  sessionDuration: number;
  onClose: () => void;
  missingResponse: Interviewer[];
}> = ({
  block,
  interviewers,
  interviewerSlots,
  panelSize,
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
              : `${block.heatmapAvailableCount} intervjuere er tilgjengelige i minst én av blokkens ordinære tider.`}
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
