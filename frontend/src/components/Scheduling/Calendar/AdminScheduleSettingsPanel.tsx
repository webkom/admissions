import React from "react";
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  LayoutPanelTop,
  Pencil,
} from "lucide-react";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";
import { ConfigStep, ConfigStepList } from "../ConfigStep";
import { buildBlockTimeChunks } from "../scheduleUtils";
import {
  CustomValueSegmentedControl,
  SaveButton,
  SchedulePanel,
  SchedulePanelBody,
  SchedulePanelHeader,
  SchedulingActionBar,
  SchedulingButton,
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
import InterviewPeriodPicker from "./InterviewPeriodPicker";
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

interface SaveStatus {
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
  closedInterviewSlotCount?: number;
  openedInterviewSlotCount?: number;
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

/** Label beside its control, as the block settings are laid out in the design. */
const InlineSettingField: React.FC<{
  label: string;
  children: React.ReactNode;
  /** Let the control take the rest of the row. */
  stretch?: boolean;
  className?: string;
}> = ({ label, children, stretch = false, className }) => (
  <div className={cn("flex min-w-0 flex-wrap items-center gap-3", className)}>
    <span className="flex-none text-ui font-medium text-text-body">
      {label}
    </span>
    <div className={stretch ? "min-w-0 flex-1" : "min-w-0"}>{children}</div>
  </div>
);

const rangeControlClass =
  "group grid min-h-control-md overflow-hidden rounded-md border border-border-soft bg-surface-base transition-[border-color,box-shadow] duration-150 hover:border-brand-strongBorder focus-within:border-brand focus-within:ring-3 focus-within:ring-brand-ringSoft";

const CompactPresetControl: React.FC<{
  label: string;
  presets: readonly number[];
  settings: CustomNumberSettings;
  min: number;
  max: number;
  step: number;
  formatValue?: (value: number) => string;
  fullWidth?: boolean;
}> = ({
  label,
  presets,
  settings,
  min,
  max,
  step,
  formatValue = (value) => `${value} min`,
  fullWidth = false,
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
      fullWidth={fullWidth}
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
  const { blockSize, completeEndMinute, slotCount, trimEndMinute } = snap ?? {
    blockSize: 0,
    completeEndMinute: undefined,
    slotCount: 0,
    trimEndMinute: undefined,
  };

  return (
    <div
      data-cy="final-block-snap-footer"
      data-motion-state={snap ? "expanded" : "empty"}
      aria-hidden={snap ? undefined : true}
      className="min-h-0 overflow-hidden"
    >
      <div className="flex h-full flex-nowrap items-center justify-between gap-4 whitespace-nowrap border-l border-border-soft bg-surface-muted px-3 py-2">
        {snap && (
          <>
            <div
              data-cy="short-final-block-note"
              aria-label={
                "Siste blokk: " +
                slotCount +
                " av " +
                blockSize +
                " intervjutider"
              }
              className="flex flex-none items-center gap-2 text-nano font-semibold text-text-muted"
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
                  onClick={() =>
                    onChangeEnd(timeValueFromMinute(trimEndMinute))
                  }
                >
                  <ArrowLeftToLine size={iconSizes.detail} aria-hidden="true" />
                  {formatTime(timeValueFromMinute(trimEndMinute))}
                </button>
              )}
              {completeEndMinute !== undefined && (
                <button
                  type="button"
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
                  <ArrowRightToLine
                    size={iconSizes.detail}
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const AdminScheduleSettingsSummary: React.FC<{
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
      <Pencil size={iconSizes.control} aria-hidden="true" />
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
  const finalBlockSnap = React.useMemo<FinalBlockSnap | null>(
    () =>
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
        : null,
    [
      block.size,
      canCompleteFinalBlock,
      canTrimFinalBlock,
      completedFinalBlockEndMinute,
      finalBlockSlotCount,
      trimmedFinalBlockEndMinute,
    ],
  );

  const fields = (
    <div className="min-w-0 pt-1" aria-label="Innstillinger for tidsrammer">
      <ConfigStepList>
        <ConfigStep number={1} title="Når skal intervjuene holdes?">
          <section
            aria-label="Intervjuperiode og daglig tidsrom"
            className="flex min-w-0 flex-wrap items-stretch gap-x-3 gap-y-4"
          >
            <div className="min-w-[17.5rem] flex-1">
              <InterviewPeriodPicker
                startDate={period.startDate}
                endDate={period.endDate}
                maxDays={MAX_RANGE_DAYS}
                invalid={!period.isValid}
                describedBy={period.isValid ? undefined : "period-input-error"}
                onChangeStartDate={period.onChangeStartDate}
                onChangeEndDate={period.onChangeEndDate}
              />
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

            <div
              data-cy="daily-time-setting"
              className="flex w-[42rem] max-w-full flex-none flex-col"
            >
              <div
                className={`${rangeControlClass} h-full h-[3.75rem] grid-cols-[auto_24rem] items-stretch`}
              >
                <div className="flex min-w-0 items-center gap-2 px-3.5 py-2">
                  <span className="flex-none text-tiny font-medium text-text-subtle">
                    Daglig
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
                  />
                  <span
                    className="flex-none text-text-subtle"
                    aria-hidden="true"
                  >
                    –
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
          </section>
        </ConfigStep>

        <ConfigStep
          number={2}
          title="Hvor lange er intervjuene?"
          description={
            <>
              Lengden{" "}
              <strong className="font-semibold">
                inkluderer pause mellom intervju
              </strong>
              .
            </>
          }
        >
          <section aria-label="Blokkoppsett">
            <div className="grid min-w-0 gap-8">
              <div data-cy="block-settings-grid" className="grid min-w-0 gap-6">
                <InlineSettingField label="Intervjulengde" stretch>
                  <CompactPresetControl
                    label="Intervjulengde"
                    presets={DURATION_PRESETS}
                    settings={duration}
                    min={SESSION_DURATION_LIMITS.min}
                    max={SESSION_DURATION_LIMITS.max}
                    step={SESSION_DURATION_LIMITS.step}
                    fullWidth
                  />
                </InlineSettingField>

                <div className="flex min-w-0 flex-wrap items-center gap-x-8 gap-y-6">
                  <InlineSettingField
                    label="Intervjuer per blokk"
                    className="min-w-[13rem] flex-[1_1_14rem]"
                    stretch
                  >
                    <Stepper
                      fullWidth
                      value={block.size}
                      min={CHUNK_SIZE_LIMITS.min}
                      max={CHUNK_SIZE_LIMITS.max}
                      step={CHUNK_SIZE_LIMITS.step}
                      onStep={block.onChangeSize}
                      aria-label="Antall intervjuer per blokk"
                    />
                  </InlineSettingField>

                  <InlineSettingField
                    label="Pause mellom blokker"
                    className="min-w-[20rem] flex-[2_1_26rem]"
                    stretch
                  >
                    <CompactPresetControl
                      fullWidth
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
                  </InlineSettingField>
                </div>
              </div>

              <aside
                data-cy="standard-block-preview-region"
                className="min-w-0"
                aria-label="Forhåndsvisning av intervjublokk"
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
        </ConfigStep>
      </ConfigStepList>
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
  actionLabel?: string;
  className?: string;
}> = ({ saveStatus, actionLabel = "Lagre tidsrammer", className }) => {
  const pendingDescription = saveStatus.availabilityAddition
    ? "Nye intervjutider blir lagt til når du lagrer."
    : saveStatus.proposalInvalidatingChange && saveStatus.hasScheduleDraft
      ? "Planutkastet må beregnes på nytt etter lagring."
      : saveStatus.gridDefiningChange
        ? "Intervjutidene oppdateres når du lagrer."
        : "Endringene er klare til å lagres.";

  return (
    <SchedulingActionBar
      className={className}
      dataCy="admin-schedule-config-footer"
      status={
        <div className="flex min-w-0 flex-col gap-2">
          {saveStatus.remoteRevisionChanged && (
            <div
              role="alert"
              className="max-w-md rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-detail font-semibold text-danger"
            >
              <p className="m-0">
                Tidsrammene er endret av en annen ansvarlig. Last inn den nyeste
                versjonen før du lagrer.
              </p>
              <SchedulingButton
                disabled={saveStatus.discardDisabled}
                variant="danger"
                className="mt-2 h-8 px-3 text-detail"
                onClick={saveStatus.onDiscard}
              >
                {saveStatus.discardDisabled
                  ? "Henter nyeste versjon…"
                  : "Forkast mine endringer og last inn siste"}
              </SchedulingButton>
            </div>
          )}
          {saveStatus.hasPendingChanges && (
            <p className="m-0 font-semibold text-text-primary">
              {pendingDescription}
            </p>
          )}
        </div>
      }
      actions={
        <>
          {saveStatus.hasPendingChanges && (
            <SchedulingButton
              disabled={
                saveStatus.remoteRevisionChanged && saveStatus.discardDisabled
              }
              onClick={saveStatus.onDiscard}
              variant="quiet"
              className="handheld:flex-1"
            >
              Forkast endringer
            </SchedulingButton>
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
        </>
      }
    />
  );
};

export default AdminScheduleSettingsPanel;
