import React from "react";
import { Check, Minus, Plus } from "lucide-react";
import cn from "src/utils/cn";

export const sectionLabelClass =
  "mb-2 block text-label font-bold uppercase tracking-label text-text-subtle";

export const actionButtonBase =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-4 py-2.5 text-ui font-semibold shadow-[0_1px_0_rgba(15,23,42,0.04)] transition-[border-color,background,box-shadow,color,transform] duration-150 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ring disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50";

export const actionButtonPrimary =
  "border-brand bg-brand text-white hover:border-brand-hover hover:bg-brand-hover hover:shadow-[0_12px_24px_-16px_var(--color-brand)] active:bg-brand-pressed font-bold";

export const actionButtonNeutral =
  "border-border-muted bg-surface-base text-text-soft hover:border-border-quiet hover:bg-surface-subtle";

export const actionButtonGhost =
  "border-transparent bg-transparent text-text-muted shadow-none hover:border-border hover:bg-surface-subtle hover:text-text-primary";

export const actionButtonActive =
  "border-brand-activeBorder bg-brand-panel text-brand hover:border-brand-activeBorder hover:bg-brand-panel hover:shadow-[0_10px_20px_-18px_var(--color-brand)]";

interface SchedulePanelProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export const SchedulePanel: React.FC<SchedulePanelProps> = ({
  children,
  className,
  id,
}) => (
  <section
    id={id}
    className={cn(
      "overflow-hidden rounded-panel border border-border bg-surface-base",
      className,
    )}
  >
    {children}
  </section>
);

interface SchedulePanelHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
  chips?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bordered?: boolean;
}

export const SchedulePanelHeader: React.FC<SchedulePanelHeaderProps> = ({
  eyebrow,
  title,
  description,
  icon: Icon,
  chips,
  actions,
  className,
  bordered = true,
}) => (
  <header
    className={cn(
      "flex flex-wrap items-start justify-between gap-4 px-6 py-5 handheld:px-4 handheld:py-4",
      bordered && "border-b border-border-soft",
      className,
    )}
  >
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {Icon && (
        <span className="mt-0.5 inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand-soft text-brand ring-1 ring-brand-border/60">
          <Icon size={17} />
        </span>
      )}
      <div className="min-w-0">
        {eyebrow && (
          <span className="mb-1.5 block text-label font-bold uppercase tracking-label text-text-subtle">
            {eyebrow}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 text-title font-bold leading-tight text-text-primary">
            {title}
          </h2>
          {chips}
        </div>
        {description && (
          <p className="m-0 mt-1 max-w-[44rem] text-ui leading-relaxed text-text-muted">
            {description}
          </p>
        )}
      </div>
    </div>
    {actions && (
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        {actions}
      </div>
    )}
  </header>
);

interface SchedulePanelBodyProps {
  children: React.ReactNode;
  className?: string;
}

export const SchedulePanelBody: React.FC<SchedulePanelBodyProps> = ({
  children,
  className,
}) => (
  <div className={cn("px-6 py-5 handheld:px-4 handheld:py-4", className)}>
    {children}
  </div>
);

interface SchedulePanelFooterProps {
  children: React.ReactNode;
  className?: string;
}

export const SchedulePanelFooter: React.FC<SchedulePanelFooterProps> = ({
  children,
  className,
}) => (
  <div
    className={cn(
      "flex flex-wrap items-center justify-between gap-3 border-t border-border-soft px-6 py-4 handheld:px-4 handheld:py-3",
      className,
    )}
  >
    {children}
  </div>
);

interface ChipProps {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "success" | "muted";
  icon?: React.ReactNode;
  className?: string;
}

export const Chip: React.FC<ChipProps> = ({
  children,
  tone = "neutral",
  icon,
  className,
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-label font-bold uppercase tracking-caps",
      tone === "brand" && "border-brand-border bg-brand-muted text-brand",
      tone === "success" && "border-success-border bg-success-bg text-success",
      tone === "muted" &&
        "border-border-soft bg-surface-subtle text-text-muted",
      tone === "neutral" && "border-border bg-surface-base text-text-muted",
      className,
    )}
  >
    {icon}
    {children}
  </span>
);

interface MetaValueProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export const MetaValue: React.FC<MetaValueProps> = ({
  label,
  value,
  className,
}) => (
  <span className={cn("inline-flex items-baseline gap-1.5", className)}>
    <span className="text-label font-bold uppercase tracking-label text-text-subtle">
      {label}
    </span>
    <span className="text-sm font-bold tabular-nums text-text-primary">
      {value}
    </span>
  </span>
);

export interface TimeValue {
  h: number;
  m: number;
}

interface StepperProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onStep: (next: number) => void;
  "aria-label"?: string;
}

export const Stepper: React.FC<StepperProps> = ({
  value,
  min,
  max,
  step = 1,
  unit,
  onStep,
  "aria-label": ariaLabel,
}) => {
  const clamp = (next: number) => {
    let result = next;
    if (typeof min === "number") result = Math.max(min, result);
    if (typeof max === "number") result = Math.min(max, result);
    return result;
  };

  const atMin = typeof min === "number" && value <= min;
  const atMax = typeof max === "number" && value >= max;

  return (
    <div
      className="inline-flex items-center gap-1 rounded-md border border-border-soft bg-surface-base px-1 py-1"
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={() => onStep(clamp(value - step))}
        disabled={atMin}
        aria-label="Reduser"
        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus size={14} />
      </button>
      <span className="inline-flex min-w-7 items-baseline justify-center gap-0.5 px-1 text-sm font-bold tabular-nums text-text-primary">
        {value}
        {unit && (
          <span className="text-label font-semibold text-text-subtle">
            {unit}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => onStep(clamp(value + step))}
        disabled={atMax}
        aria-label="Øk"
        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={14} />
      </button>
    </div>
  );
};

interface ToggleCardProps {
  title: string;
  description?: string;
  checked: boolean;
  onToggle: () => void;
}

export const ToggleCard: React.FC<ToggleCardProps> = ({
  title,
  description,
  checked,
  onToggle,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onToggle}
    className={cn(
      "group relative flex cursor-pointer flex-col gap-1 overflow-hidden rounded-[10px] border px-4 py-3 pr-12 text-left transition-[border-color,background,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-brand-strongBorder focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
      checked
        ? "border-brand-activeBorder bg-toggle-active shadow-toggle"
        : "border-border-soft bg-surface-base hover:bg-brand-soft",
    )}
  >
    <h4
      className={cn(
        "m-0 text-sm font-bold transition-colors",
        checked ? "text-brand" : "text-text-primary",
      )}
    >
      {title}
    </h4>
    {description && (
      <p
        className={cn(
          "m-0 text-detail leading-snug transition-colors",
          checked ? "text-text-secondary" : "text-text-muted",
        )}
      >
        {description}
      </p>
    )}
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border-2 transition-all duration-200",
        checked
          ? "border-brand bg-brand shadow-[0_0_0_4px_var(--color-brand-ring-soft)]"
          : "border-border-muted bg-surface-base group-hover:border-brand-strongBorder",
      )}
    >
      <Check
        size={14}
        strokeWidth={3}
        className={cn(
          "text-white transition-opacity duration-200",
          checked ? "opacity-100" : "opacity-0",
        )}
      />
    </span>
  </button>
);

interface SegmentedControlItem<Key extends string> {
  key: Key;
  label?: string;
  icon?: React.ReactNode;
  title?: string;
}

interface SegmentedControlProps<Key extends string> {
  value: Key;
  onChange: (next: Key) => void;
  items: SegmentedControlItem<Key>[];
}

export function SegmentedControl<Key extends string>({
  value,
  onChange,
  items,
}: SegmentedControlProps<Key>): JSX.Element {
  return (
    <div
      role="tablist"
      className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-base p-1"
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            title={item.title}
            onClick={() => onChange(item.key)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-ui font-semibold transition-colors",
              active
                ? "bg-brand-tint text-brand"
                : "text-text-muted hover:bg-brand-soft hover:text-text-primary",
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "neutral" | "warn";
}

export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  hint,
  tone = "neutral",
}) => (
  <div
    className={cn(
      "flex flex-col gap-1 rounded-lg border bg-surface-base px-4 py-3",
      tone === "warn"
        ? "border-brand-border bg-brand-subtle"
        : "border-border-soft",
    )}
  >
    <span className="text-label font-bold uppercase tracking-label text-text-subtle">
      {label}
    </span>
    <span className="text-xl font-extrabold tabular-nums text-text-primary">
      {value}
    </span>
    {hint && (
      <span className="text-detail leading-snug text-text-muted">{hint}</span>
    )}
  </div>
);

interface TimeSegmentInputProps {
  id?: string;
  value: TimeValue;
  onChange: (next: TimeValue) => void;
}

export const TimeSegmentInput: React.FC<TimeSegmentInputProps> = ({
  id,
  value,
  onChange,
}) => {
  const handleHour = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    if (!Number.isFinite(next)) return;
    onChange({ h: Math.min(23, Math.max(0, Math.floor(next))), m: value.m });
  };

  const handleMinute = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    if (!Number.isFinite(next)) return;
    onChange({ h: value.h, m: Math.min(59, Math.max(0, Math.floor(next))) });
  };

  return (
    <div
      id={id}
      className="inline-flex items-center gap-0.5 rounded-lg border border-border-soft bg-surface-base px-2 py-1.5"
    >
      <input
        type="number"
        min={0}
        max={23}
        value={String(value.h).padStart(2, "0")}
        onChange={handleHour}
        className="w-8 border-none bg-transparent p-0 text-center text-sm font-bold tabular-nums text-text-primary [-moz-appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        aria-label="Time"
      />
      <span className="select-none text-sm font-bold text-text-subtle">:</span>
      <input
        type="number"
        min={0}
        max={59}
        value={String(value.m).padStart(2, "0")}
        onChange={handleMinute}
        className="w-8 border-none bg-transparent p-0 text-center text-sm font-bold tabular-nums text-text-primary [-moz-appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        aria-label="Minutt"
      />
    </div>
  );
};

export interface TabNavItem<Key extends string> {
  key: Key;
  title: string;
  description?: string;
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
}

interface TabNavProps<Key extends string> {
  tabs: TabNavItem<Key>[];
  activeKey: Key;
  onChange: (next: Key) => void;
  className?: string;
}

export function TabNav<Key extends string>({
  tabs,
  activeKey,
  onChange,
  className,
}: TabNavProps<Key>): JSX.Element {
  return (
    <nav
      role="tablist"
      className={cn(
        "flex flex-wrap gap-1 rounded-panel border border-border bg-surface-base p-1",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={cn(
              "group relative flex min-w-[170px] flex-1 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-[border-color,background,box-shadow,color] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
              active
                ? "border-brand-activeBorder bg-toggle-active shadow-toggle"
                : "border-transparent bg-transparent hover:border-border-soft hover:bg-brand-soft",
            )}
          >
            {Icon && (
              <span
                className={cn(
                  "inline-flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors",
                  active
                    ? "bg-brand-fill text-brand"
                    : "bg-surface-subtle text-text-muted group-hover:bg-brand-soft group-hover:text-brand",
                )}
              >
                <Icon size={15} />
              </span>
            )}
            <span className="flex min-w-0 flex-col">
              <span
                className={cn(
                  "text-sm font-bold leading-tight",
                  active ? "text-text-primary" : "text-text-muted",
                )}
              >
                {tab.title}
              </span>
              {tab.description && (
                <span className="mt-0.5 truncate text-detail leading-tight text-text-subtle">
                  {tab.description}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
