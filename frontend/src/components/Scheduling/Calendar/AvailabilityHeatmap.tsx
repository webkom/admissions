import React, { useMemo, useRef, useState } from "react";
import { BarChart3, Check, X } from "lucide-react";
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
import ScheduleGridFrame, {
  ScheduleBlockCell,
  ScheduleDayHeader,
  ScheduleGridLegendItem,
  ScheduleSlotSegments,
  ScheduleTimeLabel,
} from "./ScheduleGridFrame";

interface AvailabilityHeatmapProps {
  interviewers: Interviewer[];
  availableSlots: Set<string>;
  dates: string[];
  dayStartMinute?: number;
  dayEndMinute?: number;
  sessionDuration: number;
  chunkSize: number;
  chunkBreakMinutes: number;
}

interface AvailabilityBlock {
  date: string;
  chunkIndex: number;
  minutes: number[];
  enabledMinutes: number[];
  slotAvailableCounts: number[];
  allAvailableInterviewers: Interviewer[];
  availableInterviewers: Interviewer[];
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
  dates,
  dayStartMinute = 8 * 60,
  dayEndMinute = 18 * 60,
  sessionDuration,
  chunkSize,
  chunkBreakMinutes,
}) => {
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [highlightedInterviewer, setHighlightedInterviewer] = useState("");
  const [isResponseDisclosureOpen, setIsResponseDisclosureOpen] =
    useState(false);
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(null);
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
  const inspectedInterviewers = useMemo(
    () =>
      genderFilter === "male"
        ? interviewers.filter((interviewer) => interviewer.gender === "M")
        : genderFilter === "female"
          ? interviewers.filter((interviewer) => interviewer.gender === "F")
          : interviewers,
    [genderFilter, interviewers],
  );
  const submitted = interviewers.filter(
    (interviewer) => interviewer.has_submitted,
  );
  const missingResponse = interviewers.filter(
    (interviewer) => !interviewer.has_submitted,
  );
  const respondentsInScope = inspectedInterviewers.filter(
    (interviewer) => interviewer.has_submitted,
  );
  const blocks = useMemo<AvailabilityBlock[]>(
    () =>
      dates.flatMap((date) =>
        chunks.map((minutes, chunkIndex) => {
          const enabledMinutes = minutes.filter((minute) =>
            availableSlots.has(makeSlotKey(date, minute)),
          );
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
          const availableInterviewerIds = new Set(
            allAvailableInterviewers.map((interviewer) => interviewer.id),
          );
          const availableInterviewers = respondentsInScope.filter(
            (interviewer) => availableInterviewerIds.has(interviewer.id),
          );
          const slotAvailableCounts = minutes.map((minute) =>
            availableSlots.has(makeSlotKey(date, minute))
              ? respondentsInScope.filter((interviewer) =>
                  interviewerSlots
                    .get(interviewer.id)
                    ?.has(makeSlotKey(date, minute)),
                ).length
              : 0,
          );
          return {
            date,
            chunkIndex,
            minutes,
            enabledMinutes,
            slotAvailableCounts,
            allAvailableInterviewers,
            availableInterviewers,
          };
        }),
      ),
    [availableSlots, chunks, dates, interviewerSlots, respondentsInScope],
  );
  const blocksByKey = useMemo(
    () =>
      new Map(
        blocks.map((block) => [`${block.date}|${block.chunkIndex}`, block]),
      ),
    [blocks],
  );
  const openBlockCount = blocks.filter(
    (block) => block.enabledMinutes.length > 0,
  ).length;
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

  return (
    <SchedulePanel className="min-w-0">
      <SchedulePanelHeader
        icon={BarChart3}
        title="Tilgjengelighetsoversikt"
        description="Se felles intervjukapasitet for hele opptaket. Opptaksgrupper avgjør hvem som deltar og hvilke søkere de kan se, ikke egne intervjugrupper."
        actions={
          <ResponseStatus
            missingResponse={missingResponse}
            isOpen={isResponseDisclosureOpen}
            onToggle={() => setIsResponseDisclosureOpen((open) => !open)}
          />
        }
      />
      <SchedulePanelBody className="flex flex-col gap-4">
        {isResponseDisclosureOpen && missingResponse.length > 0 && (
          <section
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-soft bg-surface-subtle px-3 py-2"
            aria-label="Mangler svar"
          >
            <div className="text-detail text-text-muted">
              <strong className="mr-2 text-text-primary">Mangler svar</strong>
              {missingResponse
                .map((interviewer) => interviewer.name)
                .join(" · ")}
            </div>
            <button
              type="button"
              className="text-detail font-semibold text-brand hover:text-brand-dark"
              onClick={() => setIsResponseDisclosureOpen(false)}
            >
              Skjul
            </button>
          </section>
        )}

        <fieldset className="flex flex-wrap items-end gap-x-4 gap-y-3">
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
                ...interviewers.map((interviewer) => ({
                  value: interviewer.id,
                  label: interviewer.name,
                })),
              ]}
            />
          </label>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-detail text-text-muted">
          <span>
            Farge i strekene viser andelen av de som har svart. Tallet viser
            antall tilgjengelige gjennom hele blokken.
          </span>
          <div className="flex flex-wrap items-center gap-3 font-medium">
            <SegmentLegend label="Lav tilgjengelighet" fill={0.2} />
            <SegmentLegend label="Høy tilgjengelighet" fill={0.9} />
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
          </p>
        )}
        {selectedInterviewer && (
          <p className="m-0 text-detail text-text-muted">
            {selectedInterviewer.has_submitted
              ? `Fremhever ${selectedInterviewer.name}. Det endrer ikke antallet i rutene.`
              : `${selectedInterviewer.name} har ikke svart ennå. Dekningen er uendret.`}
          </p>
        )}

        <ScheduleGridFrame dates={dates}>
          <div />
          {dates.map((date) => (
            <ScheduleDayHeader
              key={date}
              date={date}
              className="sticky top-0 z-10"
            />
          ))}
          {chunks.map((chunk, chunkIndex) => {
            return (
              <React.Fragment key={chunkIndex}>
                <ScheduleTimeLabel
                  startMinute={chunk[0]}
                  endMinute={chunk[chunk.length - 1] + sessionDuration}
                  className="sticky left-0 z-10"
                />
                {dates.map((date) => {
                  const key = `${date}|${chunkIndex}`;
                  const block = blocksByKey.get(key);
                  if (!block) return <div key={key} />;
                  const { weekday, dayMonth } = formatDateHeader(date);
                  const count = block.availableInterviewers.length;
                  const closed = block.enabledMinutes.length === 0;
                  const highlighted = isHighlighted(block);
                  const label = closed
                    ? `${weekday} ${dayMonth}: stengt`
                    : `${weekday} ${dayMonth}: ${count} av ${respondentsInScope.length} intervjuere tilgjengelige`;
                  return (
                    <ScheduleBlockCell
                      key={key}
                      role="button"
                      tabIndex={closed ? -1 : 0}
                      aria-label={
                        closed
                          ? "Stengt"
                          : `${label}. Vis hvem som er tilgjengelige.`
                      }
                      aria-pressed={
                        closed ? undefined : selectedBlockKey === key
                      }
                      onClick={(event) => {
                        if (closed) return;
                        selectedBlockTriggerRef.current = event.currentTarget;
                        setSelectedBlockKey((current) =>
                          current === key ? null : key,
                        );
                      }}
                      onKeyDown={(event) => {
                        if (
                          closed ||
                          (event.key !== "Enter" && event.key !== " ")
                        )
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
                        !closed &&
                          count === 0 &&
                          "font-semibold text-text-muted",
                        !closed && count > 0 && "font-bold text-text-primary",
                        highlighted &&
                          !closed &&
                          "ring-2 ring-inset ring-brand-border",
                      )}
                    >
                      <ScheduleSlotSegments
                        closed={closed}
                        fills={block.slotAvailableCounts.map((slotCount) =>
                          respondentsInScope.length === 0
                            ? 0
                            : slotCount / respondentsInScope.length,
                        )}
                      />
                      {!closed && <span>{count}</span>}
                      {highlighted && (
                        <span
                          aria-label="Valgt intervjuer er tilgjengelig"
                          className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-brand"
                        />
                      )}
                    </ScheduleBlockCell>
                  );
                })}
              </React.Fragment>
            );
          })}
        </ScheduleGridFrame>

        {selectedBlock && (
          <BlockDetail
            block={selectedBlock}
            interviewers={inspectedInterviewers}
            sessionDuration={sessionDuration}
            onClose={closeBlockDetail}
          />
        )}
      </SchedulePanelBody>
      <SchedulePanelFooter>
        <span className="text-detail text-text-muted">
          Klikk på en blokk for å se hvem som er tilgjengelige.
        </span>
        <span className="text-detail font-medium tabular-nums text-text-muted">
          {openBlockCount} åpne blokker
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

const ResponseStatus: React.FC<{
  missingResponse: Interviewer[];
  isOpen: boolean;
  onToggle: () => void;
}> = ({ missingResponse, isOpen, onToggle }) =>
  missingResponse.length === 0 ? (
    <span className="inline-flex items-center gap-1 text-detail font-semibold text-success">
      <Check size={iconSizes.compact} aria-hidden="true" /> Alle har svart
    </span>
  ) : (
    <button
      type="button"
      aria-expanded={isOpen}
      className="text-detail font-semibold text-brand hover:text-brand-dark hover:underline"
      onClick={onToggle}
    >
      {missingResponse.length} mangler svar ›
    </button>
  );

const BlockDetail: React.FC<{
  block: AvailabilityBlock;
  interviewers: Interviewer[];
  sessionDuration: number;
  onClose: () => void;
}> = ({ block, interviewers, sessionDuration, onClose }) => {
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
  const noResponse = interviewers.filter(
    (interviewer) => !interviewer.has_submitted,
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
              : `${available.length} intervjuere er tilgjengelige gjennom hele blokken.`}
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
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <PersonList title="Tilgjengelige" people={available} />
          <PersonList title="Ikke tilgjengelige" people={unavailable} />
          <PersonList title="Ikke svart" people={noResponse} />
        </div>
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
