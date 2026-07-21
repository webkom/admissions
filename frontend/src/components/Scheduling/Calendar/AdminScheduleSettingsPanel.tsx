import React from "react";
import { LayoutPanelTop, Pencil } from "lucide-react";
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
  visualGroupingChange: boolean;
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
  const dailyStartMinute = dailyTime.start.h * 60 + dailyTime.start.m;

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
          <div>
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
          <div className="grid min-w-0 gap-5">
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
            className="min-w-0 border-t border-border-soft pt-6 tablet:border-l tablet:border-t-0 tablet:pl-7 tablet:pt-0"
            aria-label="Forhåndsvisning av standardblokk"
          >
            <StandardBlockPreview
              startMinute={dailyStartMinute}
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
}> = ({ saveStatus, showOpenBlockCount = true }) => (
  <SchedulePanelFooter>
    <div className="flex flex-col gap-2">
      {showOpenBlockCount && (
        <div className="text-ui font-semibold tabular-nums text-text-primary">
          {saveStatus.openBlockCount} åpne blokker
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
          {saveStatus.gridDefiningChange && saveStatus.hasScheduleDraft
            ? "Endringen sletter registrert tilgjengelighet og nullstiller eksisterende intervjuforslag."
            : saveStatus.gridDefiningChange
              ? "Endringen sletter all registrert tilgjengelighet."
              : saveStatus.visualGroupingChange
                ? "Endringen påvirker bare hvordan tidslukene grupperes visuelt."
                : "Konfigurasjonen har ulagrede endringer."}
        </div>
      )}
    </div>
    <div className="flex items-center gap-3">
      {saveStatus.hasPendingChanges && (
        <button
          type="button"
          disabled={
            saveStatus.remoteRevisionChanged && saveStatus.discardDisabled
          }
          onClick={saveStatus.onDiscard}
          className="text-ui font-semibold text-text-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus disabled:cursor-wait disabled:opacity-50"
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
        >
          Lagre tidsrammer
        </SaveButton>
      )}
    </div>
  </SchedulePanelFooter>
);

export default AdminScheduleSettingsPanel;
