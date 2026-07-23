import React from "react";
import { gsap } from "gsap";
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  LayoutPanelTop,
  Pencil,
} from "lucide-react";
import { buildBlockTimeChunks } from "../scheduleUtils";
import {
  CustomValueSegmentedControl,
  SaveButton,
  SchedulePanel,
  SchedulePanelBody,
  SchedulePanelFooter,
  SchedulePanelHeader,
  Stepper,
  TimeSegmentInput,
  type TimeValue,
} from "../ui";
import {
  CHUNK_BREAK_LIMITS,
  CHUNK_SIZE_LIMITS,
  DURATION_PRESETS,
  MAX_RANGE_DAYS,
  PAUSE_PRESETS,
  SESSION_DURATION_LIMITS,
} from "./adminScheduleConfigModel";
import {
  EXPAND_CONTRACT_MOTION,
  animateContractedElement,
  animateExpandedElementOnNextFrame,
  readExpandContractState,
  setExpandedElement,
} from "./expandContractMotion";
import { ScheduleSlotSegments } from "./ScheduleGridFrame";
import StandardBlockPreview from "./StandardBlockPreview";

interface PeriodSettings {
  startDate: string;
  endDate: string;
  isValid: boolean;
  isTooLong: boolean;
  onChangeStartDate: (value: string) => void;
  onChangeEndDate: (value: string) => void;
}

interface CustomNumberSettings {
  value: number;
  isCustom: boolean;
  onSelectPreset: (value: number) => void;
  onCommitCustomValue: (value: number) => void;
}

interface DailyTimeSettings {
  start: TimeValue;
  end: TimeValue;
  isInvalid: boolean;
  onChangeStart: (value: TimeValue) => void;
  onChangeEnd: (value: TimeValue) => void;
}

interface BlockSettings {
  size: number;
  onChangeSize: (value: number) => void;
  pause: CustomNumberSettings;
}

export interface SaveStatus {
  hasPendingChanges: boolean;
  gridDefiningChange: boolean;
  proposalInvalidatingChange: boolean;
  blockStructureChange: boolean;
  visualGroupingChange: boolean;
  availabilityAddition: boolean;
  availabilityRemoval: boolean;
  hasScheduleDraft: boolean;
  remoteRevisionChanged: boolean;
  isSaving: boolean;
  saveTick: number;
  showSave: boolean;
  saveDisabled: boolean;
  discardDisabled: boolean;
  onDiscard: () => void;
  onSave: () => void;
  openBlockCount: number;
  openSlotCount?: number;
  customizationCount?: number;
  wholeBlockCount?: number;
  shortBlockCount?: number;
  partialBlockCount?: number;
  closedStandardSlotCount?: number;
  openedStandardSlotCount?: number;
  openedPauseSlotCount?: number;
  manualChangeCount?: number;
  reshapedSlotCount?: number;
}

interface AdminScheduleSettingsPanelProps {
  period: PeriodSettings;
  duration: CustomNumberSettings;
  dailyTime: DailyTimeSettings;
  block: BlockSettings;
  saveStatus: SaveStatus;
  embedded?: boolean;
  collapsed?: boolean;
  onEdit?: () => void;
}

const ControlLabel: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <span className="block text-ui font-medium text-text-muted">{children}</span>
);

const SettingField: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className="min-w-0 space-y-2">
    <ControlLabel>{label}</ControlLabel>
    <div className="min-w-0">{children}</div>
  </div>
);

const rangeControlClass =
  "group grid min-h-control-md overflow-hidden rounded-md border border-border-soft bg-surface-base transition-[border-color,box-shadow] duration-150 hover:border-brand-strongBorder focus-within:border-brand focus-within:ring-3 focus-within:ring-brand-ringSoft";

export const CompactPresetControl: React.FC<{
  label: string;
  presets: readonly number[];
  settings: CustomNumberSettings;
  min: number;
  max: number;
  step: number;
  formatValue?: (value: number) => string;
}> = ({
  label,
  presets,
  settings,
  min,
  max,
  step,
  formatValue = (value) => `${value} min`,
}) => {
  return (
    <CustomValueSegmentedControl
      label={label}
      presets={presets}
      value={settings.value}
      isCustom={settings.isCustom}
      min={min}
      max={max}
      step={step}
      formatValue={formatValue}
      onSelectPreset={settings.onSelectPreset}
      onCommitCustomValue={settings.onCommitCustomValue}
    />
  );
};

const formatDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
};

const formatTime = ({ h, m }: TimeValue) =>
  `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

const timeValueFromMinute = (minute: number): TimeValue => ({
  h: Math.floor(minute / 60),
  m: minute % 60,
});

interface FinalBlockSnap {
  slotCount: number;
  blockSize: number;
  trimEndMinute?: number;
  completeEndMinute?: number;
}

const FinalBlockSnapFooter: React.FC<{
  snap: FinalBlockSnap | null;
  onChangeEnd: (value: TimeValue) => void;
}> = ({ snap, onChangeEnd }) => {
  const footerRef = React.useRef<HTMLDivElement>(null);
  const animationRef = React.useRef<gsap.core.Tween | null>(null);
  const isOpenRef = React.useRef(snap !== null);
  const hasRenderedFooterRef = React.useRef(snap !== null);
  const hasMountedRef = React.useRef(false);
  const [renderedSnap, setRenderedSnap] = React.useState(snap);
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(EXPAND_CONTRACT_MOTION.reducedMotionQuery).matches,
  );
  const snapKey = snap
    ? [
        snap.slotCount,
        snap.blockSize,
        snap.trimEndMinute,
        snap.completeEndMinute,
      ].join(":")
    : null;
  const isOpen = snap !== null;

  React.useEffect(() => {
    hasMountedRef.current = true;
    const mediaQuery = window.matchMedia(
      EXPAND_CONTRACT_MOTION.reducedMotionQuery,
    );
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  React.useLayoutEffect(() => {
    if (snap) setRenderedSnap(snap);
  }, [snap, snapKey]);

  React.useLayoutEffect(() => {
    const footer = footerRef.current;
    if (!footer || !renderedSnap) return undefined;

    animationRef.current?.kill();
    animationRef.current = null;
    gsap.killTweensOf(footer);

    const currentState =
      isOpen && !isOpenRef.current && !hasRenderedFooterRef.current
        ? readExpandContractState(null)
        : readExpandContractState(footer);
    hasRenderedFooterRef.current = true;

    if (!hasMountedRef.current || prefersReducedMotion) {
      isOpenRef.current = isOpen;
      if (isOpen) {
        setExpandedElement(footer, footer.scrollHeight);
      } else {
        hasRenderedFooterRef.current = false;
        setRenderedSnap(null);
      }
      return undefined;
    }

    let cancelScheduledExpansion: (() => void) | undefined;
    if (isOpen) {
      const durationSeconds = isOpenRef.current
        ? 0
        : EXPAND_CONTRACT_MOTION.durationSeconds;
      cancelScheduledExpansion = animateExpandedElementOnNextFrame({
        resolveElement: () => footerRef.current,
        from: currentState,
        height: (element) => element.scrollHeight,
        durationSeconds,
        onStart: (animation) => {
          animationRef.current = animation;
        },
      });
    } else {
      animationRef.current = animateContractedElement({
        element: footer,
        from: currentState,
        onComplete: () => {
          if (!isOpenRef.current) {
            hasRenderedFooterRef.current = false;
            setRenderedSnap(null);
          }
        },
      });
    }
    isOpenRef.current = isOpen;

    return () => {
      cancelScheduledExpansion?.();
      animationRef.current?.kill();
    };
  }, [isOpen, prefersReducedMotion, renderedSnap]);

  React.useLayoutEffect(
    () => () => {
      animationRef.current?.kill();
      if (footerRef.current) gsap.killTweensOf(footerRef.current);
    },
    [],
  );

  if (!renderedSnap) return null;
  const { blockSize, completeEndMinute, slotCount, trimEndMinute } =
    renderedSnap;

  return (
    <div
      ref={footerRef}
      data-cy="final-block-snap-footer"
      data-motion="expand-contract-down"
      data-motion-state={isOpen ? "expanded" : "contracting"}
      aria-hidden={isOpen ? undefined : true}
      className="col-[1/-1] min-h-0 origin-top overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-soft bg-surface-muted px-3 py-2">
        <div
          data-cy="short-final-block-note"
          aria-label={
            "Siste blokk: " + slotCount + " av " + blockSize + " intervjutider"
          }
          className="flex min-w-0 items-center gap-2 text-nano font-semibold text-text-muted"
        >
          <span className="whitespace-nowrap">Siste blokk</span>
          <ScheduleSlotSegments
            fills={Array.from({ length: blockSize }, (_, index) =>
              index < slotCount ? 1 : 0,
            )}
            className="w-14 flex-none"
          />
          <span className="tabular-nums">
            {slotCount}/{blockSize}
          </span>
        </div>
        <div
          role="group"
          aria-label="Juster sluttid til hel blokk"
          className="inline-flex items-center rounded-md border border-border-soft bg-surface-base p-1"
        >
          {trimEndMinute !== undefined && (
            <button
              type="button"
              disabled={!isOpen}
              tabIndex={isOpen ? 0 : -1}
              data-cy="trim-final-block"
              aria-label={
                "Forkort sluttid til " +
                formatTime(timeValueFromMinute(trimEndMinute))
              }
              title={
                "Forkort sluttid til " +
                formatTime(timeValueFromMinute(trimEndMinute))
              }
              className="inline-flex min-h-7 items-center gap-1 rounded px-2 text-detail font-semibold text-text-muted transition-colors hover:bg-brand-soft hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-focus disabled:pointer-events-none"
              onClick={() => onChangeEnd(timeValueFromMinute(trimEndMinute))}
            >
              <ArrowLeftToLine size={13} aria-hidden="true" />
              {formatTime(timeValueFromMinute(trimEndMinute))}
            </button>
          )}
          {completeEndMinute !== undefined && (
            <button
              type="button"
              disabled={!isOpen}
              tabIndex={isOpen ? 0 : -1}
              data-cy="complete-final-block"
              aria-label={
                "Utvid sluttid til " +
                formatTime(timeValueFromMinute(completeEndMinute))
              }
              title={
                "Utvid sluttid til " +
                formatTime(timeValueFromMinute(completeEndMinute))
              }
              className="inline-flex min-h-7 items-center gap-1 rounded px-2 text-detail font-semibold text-text-muted transition-colors hover:bg-brand-soft hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-focus disabled:pointer-events-none"
              onClick={() =>
                onChangeEnd(timeValueFromMinute(completeEndMinute))
              }
            >
              {formatTime(timeValueFromMinute(completeEndMinute))}
              <ArrowRightToLine size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const AdminScheduleSettingsSummary: React.FC<{
  period: PeriodSettings;
  duration: CustomNumberSettings;
  dailyTime: DailyTimeSettings;
  block: BlockSettings;
  onEdit: () => void;
}> = ({ period, duration, dailyTime, block, onEdit }) => (
  <div className="flex flex-wrap items-center justify-between gap-4 py-1">
    <dl className="m-0 grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-3 tablet:grid-cols-5">
      <div className="min-w-0">
        <dt className="text-tiny font-medium text-text-subtle">Periode</dt>
        <dd className="m-0 mt-0.5 truncate text-detail font-semibold text-text-primary">
          {formatDate(period.startDate)}–{formatDate(period.endDate)}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-tiny font-medium text-text-subtle">Daglig</dt>
        <dd className="m-0 mt-0.5 text-detail font-semibold tabular-nums text-text-primary">
          {formatTime(dailyTime.start)}–{formatTime(dailyTime.end)}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-tiny font-medium text-text-subtle">Intervju</dt>
        <dd className="m-0 mt-0.5 text-detail font-semibold text-text-primary">
          {duration.value} min
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-tiny font-medium text-text-subtle">Per blokk</dt>
        <dd className="m-0 mt-0.5 text-detail font-semibold text-text-primary">
          {block.size} intervjuer
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-tiny font-medium text-text-subtle">Pause</dt>
        <dd className="m-0 mt-0.5 text-detail font-semibold text-text-primary">
          {block.pause.value === 0 ? "Ingen" : `${block.pause.value} min`}
        </dd>
      </div>
    </dl>
    <button
      type="button"
      onClick={onEdit}
      className="inline-flex min-h-9 flex-none items-center gap-2 rounded-md border border-border-soft bg-surface-base px-3 text-detail font-semibold text-text-muted transition-colors hover:border-brand-strongBorder hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"
    >
      <Pencil size={15} aria-hidden="true" />
      Rediger tidsrammer
    </button>
  </div>
);

const AdminScheduleSettingsPanel: React.FC<AdminScheduleSettingsPanelProps> = ({
  period,
  duration,
  dailyTime,
  block,
  saveStatus,
  embedded = false,
  collapsed = false,
  onEdit,
}) => {
  const [standaloneCollapsed, setStandaloneCollapsed] = React.useState(false);
  const previousSaveTick = React.useRef(saveStatus.saveTick);
  React.useEffect(() => {
    if (embedded || saveStatus.saveTick === previousSaveTick.current) return;
    previousSaveTick.current = saveStatus.saveTick;
    setStandaloneCollapsed(true);
  }, [embedded, saveStatus.saveTick]);

  const isCollapsed = embedded ? collapsed : standaloneCollapsed;
  const handleEdit = onEdit ?? (() => setStandaloneCollapsed(false));
  const startMinute = dailyTime.start.h * 60 + dailyTime.start.m;
  const endMinute = dailyTime.end.h * 60 + dailyTime.end.m;
  const previewChunks = React.useMemo(
    () =>
      buildBlockTimeChunks({
        dayStartMinute: startMinute,
        dayEndMinute: endMinute,
        sessionDuration: duration.value,
        chunkSize: block.size,
        chunkBreakMinutes: block.pause.value,
      }),
    [block.pause.value, block.size, duration.value, endMinute, startMinute],
  );
  const finalChunk = previewChunks[previewChunks.length - 1];
  const finalBlockSlotCount =
    finalChunk && finalChunk.length < block.size
      ? finalChunk.length
      : undefined;
  const completedFinalBlockEndMinute =
    finalBlockSlotCount !== undefined && finalChunk
      ? finalChunk[0] + block.size * duration.value
      : undefined;
  const canCompleteFinalBlock =
    completedFinalBlockEndMinute !== undefined &&
    completedFinalBlockEndMinute > endMinute &&
    completedFinalBlockEndMinute <= 24 * 60;
  const trimmedFinalBlockEndMinute = finalChunk?.[0];
  const canTrimFinalBlock =
    trimmedFinalBlockEndMinute !== undefined &&
    trimmedFinalBlockEndMinute > startMinute;
  const finalBlockSnap =
    finalBlockSlotCount !== undefined &&
    (canTrimFinalBlock || canCompleteFinalBlock)
      ? {
          slotCount: finalBlockSlotCount,
          blockSize: block.size,
          trimEndMinute: canTrimFinalBlock
            ? trimmedFinalBlockEndMinute
            : undefined,
          completeEndMinute: canCompleteFinalBlock
            ? completedFinalBlockEndMinute
            : undefined,
        }
      : null;

  const fields = (
    <div
      className="min-w-0 space-y-6 py-1"
      aria-label="Innstillinger for tidsrammer"
    >
      <section
        aria-label="Intervjuperiode og daglig tidsrom"
        className="grid min-w-0 gap-5 tablet:grid-cols-[minmax(21rem,1.15fr)_minmax(18rem,0.85fr)] tablet:items-start"
      >
        <SettingField label="Intervjuperiode">
          <div>
            <div
              className={`${rangeControlClass} w-full grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]`}
            >
              <label className="flex min-w-0 flex-col justify-center py-1.5 pl-3 pr-2">
                <span className="text-tiny font-medium text-text-subtle">
                  Fra
                </span>
                <input
                  id="period-start"
                  aria-label="Startdato for intervjuperioden"
                  aria-invalid={!period.isValid}
                  aria-describedby={
                    period.isValid ? undefined : "period-input-error"
                  }
                  type="date"
                  value={period.startDate}
                  className="w-full min-w-0 cursor-pointer border-none bg-transparent p-0 text-sm font-bold text-text-primary focus:outline-none"
                  onChange={(event) =>
                    period.onChangeStartDate(event.target.value)
                  }
                />
              </label>
              <span
                className="my-2 h-6 w-px flex-none bg-border-soft"
                aria-hidden="true"
              />
              <label className="flex min-w-0 flex-col justify-center py-1.5 pl-3 pr-2">
                <span className="text-tiny font-medium text-text-subtle">
                  Til
                </span>
                <input
                  type="date"
                  aria-label="Sluttdato for intervjuperioden"
                  aria-invalid={!period.isValid}
                  aria-describedby={
                    period.isValid ? undefined : "period-input-error"
                  }
                  value={period.endDate}
                  min={period.startDate}
                  className="w-full min-w-0 cursor-pointer border-none bg-transparent p-0 text-sm font-bold text-text-primary focus:outline-none"
                  onChange={(event) =>
                    period.onChangeEndDate(event.target.value)
                  }
                />
              </label>
            </div>
            {!period.isValid && (
              <span
                id="period-input-error"
                aria-live="polite"
                className="mt-1 block text-xs font-semibold text-danger"
              >
                {period.isTooLong
                  ? `Maks ${MAX_RANGE_DAYS} dager`
                  : "Ugyldig periode"}
              </span>
            )}
          </div>
        </SettingField>

        <SettingField label="Daglig tidsrom">
          <div
            data-cy="daily-time-setting"
            className="min-h-[6.5rem] handheld:min-h-[9rem]"
          >
            <div
              className={`${rangeControlClass} w-full grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]`}
            >
              <div className="flex min-w-0 flex-col justify-center py-1.5 pl-3 pr-2">
                <span className="text-tiny font-medium text-text-subtle">
                  Fra
                </span>
                <TimeSegmentInput
                  id="start-time"
                  aria-label="Starttid per dag"
                  aria-invalid={dailyTime.isInvalid}
                  aria-describedby={
                    dailyTime.isInvalid ? "daily-time-error" : undefined
                  }
                  value={dailyTime.start}
                  onChange={dailyTime.onChangeStart}
                  bare
                  className="justify-start"
                />
              </div>
              <span
                className="my-2 h-6 w-px flex-none bg-border-soft"
                aria-hidden="true"
              />
              <div className="flex min-w-0 flex-col justify-center py-1.5 pl-3 pr-2">
                <span className="text-tiny font-medium text-text-subtle">
                  Til
                </span>
                <TimeSegmentInput
                  aria-label="Sluttid per dag"
                  aria-invalid={dailyTime.isInvalid}
                  aria-describedby={
                    dailyTime.isInvalid ? "daily-time-error" : undefined
                  }
                  allowEndOfDay
                  value={dailyTime.end}
                  onChange={dailyTime.onChangeEnd}
                  bare
                  className="justify-start"
                />
              </div>
              <FinalBlockSnapFooter
                snap={finalBlockSnap}
                onChangeEnd={dailyTime.onChangeEnd}
              />
            </div>
            {dailyTime.isInvalid && (
              <span
                id="daily-time-error"
                aria-live="polite"
                className="mt-1 block text-xs font-semibold text-danger"
              >
                Ugyldig tidsrom
              </span>
            )}
          </div>
        </SettingField>
      </section>

      <section
        className="border-t border-border-soft pt-6"
        aria-label="Blokkoppsett"
      >
        <div className="grid min-w-0 gap-7 tablet:grid-cols-[minmax(21rem,0.85fr)_minmax(0,1.15fr)] tablet:items-start">
          <div data-cy="block-settings-grid" className="grid min-w-0 gap-5">
            <SettingField label="Intervjulengde (inkludert pause mellom intervju for evaluering)">
              <CompactPresetControl
                label="Intervjulengde"
                presets={DURATION_PRESETS}
                settings={duration}
                min={SESSION_DURATION_LIMITS.min}
                max={SESSION_DURATION_LIMITS.max}
                step={SESSION_DURATION_LIMITS.step}
              />
            </SettingField>

            <SettingField label="Antall intervjuer per blokk">
              <Stepper
                value={block.size}
                min={CHUNK_SIZE_LIMITS.min}
                max={CHUNK_SIZE_LIMITS.max}
                step={CHUNK_SIZE_LIMITS.step}
                onStep={block.onChangeSize}
                aria-label="Antall intervjuer per blokk"
              />
            </SettingField>

            <SettingField label="Pause mellom blokker (for å f.eks skifte intervjuere)">
              <CompactPresetControl
                label="Pause mellom blokker"
                presets={PAUSE_PRESETS}
                settings={block.pause}
                min={CHUNK_BREAK_LIMITS.min}
                max={CHUNK_BREAK_LIMITS.max}
                step={CHUNK_BREAK_LIMITS.step}
                formatValue={(value) =>
                  value === 0 ? "Ingen" : `${value} min`
                }
              />
            </SettingField>
          </div>

          <aside
            data-cy="standard-block-preview-region"
            className="min-w-0 border-t border-border-soft pt-6 tablet:border-l tablet:border-t-0 tablet:pl-7 tablet:pt-0"
            aria-label="Forhåndsvisning av standardblokk"
          >
            <StandardBlockPreview
              startMinute={startMinute}
              interviewDuration={duration.value}
              interviewCount={block.size}
              pauseMinutes={block.pause.value}
            />
          </aside>
        </div>
      </section>
    </div>
  );

  const content = isCollapsed ? (
    <AdminScheduleSettingsSummary
      period={period}
      duration={duration}
      dailyTime={dailyTime}
      block={block}
      onEdit={handleEdit}
    />
  ) : (
    fields
  );

  if (embedded) return content;

  return (
    <SchedulePanel>
      <SchedulePanelHeader icon={LayoutPanelTop} title="Tidsrammer" />
      <SchedulePanelBody>{content}</SchedulePanelBody>
      {(!isCollapsed || saveStatus.hasPendingChanges) && (
        <AdminScheduleConfigFooter saveStatus={saveStatus} />
      )}
    </SchedulePanel>
  );
};

export const AdminScheduleConfigFooter: React.FC<{
  saveStatus: SaveStatus;
  showOpenBlockCount?: boolean;
  actionLabel?: string;
  className?: string;
}> = ({
  saveStatus,
  showOpenBlockCount = true,
  actionLabel = "Lagre tidsrammer",
  className,
}) => {
  const wholeBlockCount = saveStatus.wholeBlockCount ?? 0;
  const closedStandardSlotCount = saveStatus.closedStandardSlotCount ?? 0;
  const openedStandardSlotCount = saveStatus.openedStandardSlotCount ?? 0;
  const openedPauseSlotCount = saveStatus.openedPauseSlotCount ?? 0;
  const primaryParts = [
    wholeBlockCount > 0
      ? wholeBlockCount === 1
        ? "1 hel blokk"
        : `${wholeBlockCount} hele blokker`
      : null,
    (saveStatus.shortBlockCount ?? 0) > 0
      ? `${saveStatus.shortBlockCount} ${
          saveStatus.shortBlockCount === 1
            ? "kort sluttblokk"
            : "korte sluttblokker"
        }`
      : null,
    (saveStatus.partialBlockCount ?? 0) > 0
      ? `${saveStatus.partialBlockCount} ${
          saveStatus.partialBlockCount === 1 ? "delvis åpen" : "delvis åpne"
        }`
      : null,
    `${saveStatus.openSlotCount ?? 0} åpne intervjutider`,
  ].filter(Boolean);
  const deviationParts = [
    closedStandardSlotCount > 0
      ? `${closedStandardSlotCount} ${
          closedStandardSlotCount === 1 ? "standardtid" : "standardtider"
        } stengt`
      : null,
    openedStandardSlotCount > 0
      ? `${openedStandardSlotCount} ${
          openedStandardSlotCount === 1 ? "standardtid" : "standardtider"
        } åpnet enkeltvis`
      : null,
    openedPauseSlotCount > 0
      ? `${openedPauseSlotCount} ${
          openedPauseSlotCount === 1 ? "ekstratid" : "ekstratider"
        } åpnet`
      : null,
  ].filter(Boolean);
  const manualChangeCount =
    saveStatus.manualChangeCount ?? saveStatus.customizationCount ?? 0;

  return (
    <SchedulePanelFooter
      className={className}
      dataCy="admin-schedule-config-footer"
    >
      <div className="flex min-w-0 flex-col gap-2">
        {showOpenBlockCount && (
          <div className="min-w-0 tabular-nums text-text-primary">
            <div className="text-ui font-semibold handheld:hidden">
              {primaryParts.join(" · ")}
            </div>
            {deviationParts.length > 0 && (
              <div className="mt-0.5 text-detail text-text-muted handheld:hidden">
                {deviationParts.join(" · ")}
              </div>
            )}
            <div className="hidden text-ui font-semibold handheld:block">
              {saveStatus.openSlotCount ?? 0} åpne intervjutider ·{" "}
              {manualChangeCount} manuelle endringer
            </div>
            {manualChangeCount > 0 && (
              <details className="mt-1 hidden text-detail text-text-muted handheld:block">
                <summary className="cursor-pointer font-semibold text-text-primary">
                  Vis endringer
                </summary>
                <p className="m-0 mt-1">{deviationParts.join(" · ")}</p>
              </details>
            )}
          </div>
        )}
        {saveStatus.remoteRevisionChanged && (
          <div
            role="alert"
            className="max-w-md rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-detail font-semibold text-danger"
          >
            <p className="m-0">
              Tidsrammene er endret av en annen ansvarlig. Last inn den nyeste
              versjonen før du lagrer.
            </p>
            <button
              type="button"
              disabled={saveStatus.discardDisabled}
              className="mt-2 rounded-md border border-danger-border bg-surface-base px-3 py-1.5 text-detail font-bold text-danger transition-colors hover:bg-danger-bg disabled:cursor-wait disabled:border-border-soft disabled:bg-surface-muted disabled:text-text-muted"
              onClick={saveStatus.onDiscard}
            >
              {saveStatus.discardDisabled
                ? "Henter nyeste versjon…"
                : "Forkast mine endringer og last inn siste"}
            </button>
          </div>
        )}
        {saveStatus.hasPendingChanges && (
          <div className="max-w-xs text-detail leading-snug text-text-muted">
            <p className="m-0 font-semibold text-text-primary">
              Ulagrede endringer
            </p>
            <p className="m-0 mt-0.5">
              {saveStatus.gridDefiningChange &&
              (saveStatus.reshapedSlotCount ?? 0) > 0
                ? `Endringen oppdaterte intervjublokkene og fjernet ${saveStatus.reshapedSlotCount} tidligere åpne valg fra utkastet. Kontroller rutenettet før du lagrer.`
                : saveStatus.gridDefiningChange && saveStatus.hasScheduleDraft
                  ? "Ny intervjulengde tømmer valgte tider og bekreftelsen, men beholder registrerte inhabiliteter. Intervjuforslaget nullstilles."
                  : saveStatus.gridDefiningChange
                    ? "Ny intervjulengde tømmer valgte tider og bekreftelsen, men beholder registrerte inhabiliteter."
                    : saveStatus.blockStructureChange &&
                        saveStatus.hasScheduleDraft
                      ? "Endringen oppdaterer blokkstrukturen og nullstiller intervjuforslaget. Registrert tilgjengelighet beholdes."
                      : saveStatus.proposalInvalidatingChange &&
                          saveStatus.hasScheduleDraft
                        ? "Endringen kan fjerne eller flytte intervjutider og nullstiller intervjuforslaget. Registrert tilgjengelighet beholdes."
                        : saveStatus.blockStructureChange
                          ? "Blokkstrukturen har ulagrede endringer."
                          : saveStatus.availabilityAddition
                            ? "Nye åpne tider gjør eksisterende tilgjengelighet utdatert til den er bekreftet på nytt."
                            : saveStatus.availabilityRemoval
                              ? "Stengte tider fjernes fra svarene uten å gjøre bekreftelsen utdatert."
                              : saveStatus.visualGroupingChange
                                ? "Endringen påvirker bare hvordan tidslukene grupperes visuelt."
                                : "Konfigurasjonen har ulagrede endringer."}
            </p>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 handheld:w-full">
        {saveStatus.hasPendingChanges && (
          <button
            type="button"
            disabled={
              saveStatus.remoteRevisionChanged && saveStatus.discardDisabled
            }
            onClick={saveStatus.onDiscard}
            className="text-ui font-semibold text-text-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus disabled:cursor-wait disabled:opacity-50 handheld:min-h-control-md handheld:flex-1"
          >
            Forkast endringer
          </button>
        )}
        {saveStatus.showSave && (
          <SaveButton
            isSaving={saveStatus.isSaving}
            saveTick={saveStatus.saveTick}
            onClick={saveStatus.onSave}
            disabled={saveStatus.saveDisabled}
            className="handheld:flex-1"
          >
            {actionLabel}
          </SaveButton>
        )}
      </div>
    </SchedulePanelFooter>
  );
};

export default AdminScheduleSettingsPanel;
