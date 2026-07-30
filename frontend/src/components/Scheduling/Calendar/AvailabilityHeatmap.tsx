import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Check, X } from "lucide-react";
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
  keyboardFocusRingClass,
} from "../ui";
import {
  ScheduleBlockCell,
  ScheduleDayHeader,
  ScheduleSlotSegments,
  ScheduleTimeLabel,
  scheduleAvailableCellClass,
  scheduleInteractiveCellMotionClass,
} from "./ScheduleGridFrame";
import ScheduleGridFrame from "./ScheduleGridFrame";
import {
  buildAvailabilityCoverage,
  type BlockCoverage,
} from "./availabilityCoverage";
import AvailabilityFilters, {
  type AvailabilityGenderFilter,
} from "./AvailabilityFilters";

const responseDisclosureId = "availability-response-status";

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
  stage?: string;
  foundationNav?: React.ReactNode;
  footerStatus?: React.ReactNode;
  footerAction?: React.ReactNode;
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

const availabilityRatio = (
  availableCount: number,
  heatmapCapacity: number,
): number => {
  if (heatmapCapacity <= 0) return 0;
  return Math.min(Math.max(availableCount, 0) / heatmapCapacity, 1);
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
  stage,
  foundationNav,
  footerStatus,
  footerAction,
}) => {
  const [genderFilter, setGenderFilter] =
    useState<AvailabilityGenderFilter>("all");
  const [highlightedInterviewer, setHighlightedInterviewer] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isResponseDisclosureOpen, setIsResponseDisclosureOpen] =
    useState(false);
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(null);
  const [participationSavingId, setParticipationSavingId] = useState("");
  const [experienceSavingId, setExperienceSavingId] = useState("");
  const [pendingOptOutId, setPendingOptOutId] = useState("");
  const selectedBlockTriggerRef = useRef<HTMLElement | null>(null);
  const optOutTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const participationReturnRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingOptOutCancelRef = useRef<HTMLButtonElement>(null);
  const restoreOptOutFocusIdRef = useRef("");

  useLayoutEffect(() => {
    if (pendingOptOutId) {
      if (participationSavingId !== pendingOptOutId) {
        pendingOptOutCancelRef.current?.focus();
      }
      return;
    }
    const interviewerId = restoreOptOutFocusIdRef.current;
    if (!interviewerId) return;
    restoreOptOutFocusIdRef.current = "";
    (
      participationReturnRefs.current.get(interviewerId) ??
      optOutTriggerRefs.current.get(interviewerId)
    )?.focus();
  }, [pendingOptOutId, participationSavingId]);
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
        restoreOptOutFocusIdRef.current = interviewer.id;
        setPendingOptOutId("");
      }
    } catch {
      // The parent mutation owns the visible error state.
    } finally {
      setParticipationSavingId("");
    }
  };
  const cancelOptOut = (interviewerId: string) => {
    restoreOptOutFocusIdRef.current = interviewerId;
    setPendingOptOutId("");
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
            ref={pendingOptOutCancelRef}
            type="button"
            disabled={participationSavingId === interviewer.id}
            onClick={() => cancelOptOut(interviewer.id)}
            className={cn(
              "text-detail font-semibold text-text-muted hover:underline disabled:opacity-50",
              keyboardFocusRingClass,
            )}
          >
            Avbryt
          </button>
          <button
            type="button"
            disabled={participationSavingId === interviewer.id}
            onClick={() =>
              void changeParticipation(interviewer, "not_participating")
            }
            className={cn(
              "text-detail font-semibold text-danger hover:underline disabled:opacity-50",
              keyboardFocusRingClass,
            )}
          >
            Bekreft
          </button>
        </>
      ) : (
        <button
          ref={(node) => {
            if (node) optOutTriggerRefs.current.set(interviewer.id, node);
            else optOutTriggerRefs.current.delete(interviewer.id);
          }}
          type="button"
          disabled={participationSavingId === interviewer.id}
          onClick={() => setPendingOptOutId(interviewer.id)}
          className={cn(
            "text-detail font-semibold text-brand hover:underline disabled:opacity-50",
            keyboardFocusRingClass,
          )}
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
            )
              .catch(() => undefined)
              .finally(() => setExperienceSavingId(""));
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
    <SchedulePanel
      dataCy={stage ? "schedule-stage" : undefined}
      stage={stage}
      className="min-w-0"
    >
      {foundationNav}
      <SchedulePanelHeader
        icon={BarChart3}
        title="Tilgjengelighetsoversikt"
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
      <SchedulePanelBody className="flex flex-col gap-3">
        {isResponseDisclosureOpen &&
          (missingResponse.length > 0 ||
            optedOut.length > 0 ||
            Boolean(onParticipationChange)) && (
            <section
              id={responseDisclosureId}
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
                          ref={(node) => {
                            if (node)
                              participationReturnRefs.current.set(
                                interviewer.id,
                                node,
                              );
                            else
                              participationReturnRefs.current.delete(
                                interviewer.id,
                              );
                          }}
                          type="button"
                          disabled={participationSavingId === interviewer.id}
                          onClick={() =>
                            void changeParticipation(
                              interviewer,
                              "awaiting_response",
                            )
                          }
                          className={cn(
                            "text-detail font-semibold text-brand hover:underline disabled:opacity-50",
                            keyboardFocusRingClass,
                          )}
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
                  className={cn(
                    "text-detail font-semibold text-brand hover:underline",
                    keyboardFocusRingClass,
                  )}
                >
                  Skjul
                </button>
              </div>
            </section>
          )}
        <AvailabilityFilters
          isOpen={isFilterOpen}
          onToggle={() => setIsFilterOpen((open) => !open)}
          genderFilter={genderFilter}
          onGenderFilterChange={setGenderFilter}
          highlightedInterviewer={highlightedInterviewer}
          onHighlightedInterviewerChange={setHighlightedInterviewer}
          interviewers={participatingInterviewers}
        />

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

        <ScheduleGridFrame
          dates={dates}
          layout="grid"
          gridClassName="items-stretch"
        >
          <div aria-hidden="true" className="min-h-16" />
          {dates.map((date) => (
            <div
              key={`header-${date}`}
              data-cy="availability-day-header"
              data-date={date}
              className="min-w-0"
            >
              <ScheduleDayHeader date={date} className="sticky top-0 z-10" />
            </div>
          ))}

          {chunks.map((chunk, chunkIndex) => (
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
                const count = block.heatmapAvailableCount;
                const closed = block.enabledMinutes.length === 0;
                const highlighted = isHighlighted(block);
                const selected = selectedBlockKey === key;
                const ratio = availabilityRatio(count, heatmapCapacity);
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
                    data-date={date}
                    data-chunk-index={chunkIndex}
                    role="button"
                    tabIndex={closed ? -1 : 0}
                    aria-label={
                      closed
                        ? "Stengt"
                        : `${label}. Vis hvem som er tilgjengelige.`
                    }
                    aria-pressed={closed ? undefined : selected}
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
                      scheduleInteractiveCellMotionClass,
                      "text-center tabular-nums",
                      !closed && scheduleAvailableCellClass,
                      !closed && "cursor-pointer",
                      !closed &&
                        heatmapCapacity > 0 &&
                        count === heatmapCapacity &&
                        "bg-brand-soft",
                      selected &&
                        !closed &&
                        "border-brand-activeBorder ring-1 ring-inset ring-brand-border",
                      highlighted &&
                        !closed &&
                        "ring-2 ring-inset ring-brand-border",
                    )}
                  >
                    {closed ? (
                      <span className="text-label font-semibold text-text-disabled">
                        Stengt
                      </span>
                    ) : (
                      <>
                        <span
                          className={cn(
                            "text-ui font-semibold",
                            count === 0
                              ? "text-text-muted"
                              : "text-text-primary",
                          )}
                        >
                          {availabilityText}
                        </span>
                        <ScheduleSlotSegments
                          className="h-schedule-progress"
                          fills={block.enabledMinutes.map(() => ratio)}
                        />
                      </>
                    )}
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
          ))}
        </ScheduleGridFrame>

        {selectedBlock && (
          <BlockDetail
            block={selectedBlock}
            interviewers={inspectedInterviewers}
            interviewerSlots={interviewerSlots}
            sessionDuration={sessionDuration}
            onClose={closeBlockDetail}
            missingResponse={missingResponse}
          />
        )}
      </SchedulePanelBody>
      <SchedulePanelFooter>
        {footerStatus ?? (
          <span className="text-detail text-text-muted">
            Klikk på en blokk for å se hvem som er tilgjengelige.
          </span>
        )}
        {footerAction}
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
      aria-controls={responseDisclosureId}
      className={cn(
        "text-detail font-semibold text-brand hover:text-brand-dark hover:underline",
        keyboardFocusRingClass,
      )}
      onClick={onToggle}
    >
      {canManage ? "Administrer" : "Vis status"}
    </button>
  );

const BlockDetail: React.FC<{
  block: AvailabilityBlock;
  interviewers: Interviewer[];
  interviewerSlots: Map<string, Set<string>>;
  sessionDuration: number;
  onClose: () => void;
  missingResponse: Interviewer[];
}> = ({
  block,
  interviewers,
  interviewerSlots,
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
            {weekday} {dayMonth}, {formatMinutes(block.minutes[0])}–
            {formatMinutes(
              block.minutes[block.minutes.length - 1] + sessionDuration,
            )}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "rounded p-1 text-text-muted hover:bg-surface-neutral hover:text-text-primary",
            keyboardFocusRingClass,
          )}
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
                  className="grid gap-1 py-2 text-detail sm:grid-cols-[5rem_1fr] sm:items-baseline"
                >
                  <strong className="tabular-nums text-text-primary">
                    {formatMinutes(minute)}
                  </strong>
                  <span className="text-text-muted">
                    {availableAtTime.length > 0
                      ? availableAtTime
                          .map((interviewer) => interviewer.name)
                          .join(", ")
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
