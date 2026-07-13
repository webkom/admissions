import React from "react";
import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import cn from "src/utils/cn";

export const sectionLabelClass =
  "mb-2 block text-ui font-semibold text-text-muted";

export const actionButtonBase =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-ui font-semibold transition-[border-color,background,color,box-shadow] duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring disabled:cursor-not-allowed disabled:opacity-50";

export const actionButtonPrimary =
  "border-brand bg-brand font-semibold text-white hover:border-brand-hover hover:bg-brand-hover active:bg-brand-pressed";

export const actionButtonNeutral =
  "border-border bg-surface-subtle text-text-primary hover:bg-surface-neutral";

export const actionButtonGhost =
  "border-transparent bg-transparent text-text-muted shadow-none hover:border-border hover:bg-surface-subtle hover:text-text-primary";

export const actionButtonActive =
  "border-brand bg-brand text-white hover:border-brand-hover hover:bg-brand-hover";

export const actionButtonDanger =
  "border-danger-border bg-danger-bg text-danger hover:border-danger hover:bg-danger hover:text-white font-bold";

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
      "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-detail font-semibold",
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

type SaveButtonVariant = "primary" | "neutral" | "link";

interface SaveButtonProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "type"
  > {
  isSaving: boolean;
  saveTick?: number;
  succeeded?: boolean;
  variant?: SaveButtonVariant;
  savingLabel?: string;
  savedLabel?: string;
  children: React.ReactNode;
}

export const SaveButton = React.forwardRef<HTMLButtonElement, SaveButtonProps>(
  (
    {
      isSaving,
      saveTick,
      succeeded = true,
      variant = "primary",
      savingLabel = "Lagrer…",
      savedLabel = "Lagret!",
      children,
      className,
      disabled,
      onClick,
      ...rest
    },
    ref,
  ) => {
    const [justSaved, setJustSaved] = React.useState(false);
    const [saveCooldown, setSaveCooldown] = React.useState(false);
    const wasSaving = React.useRef(isSaving);
    const lastTick = React.useRef(saveTick);
    const timeoutRef = React.useRef<number | null>(null);
    const saveInProgressRef = React.useRef(false);
    const [delayedIsSaving, setDelayedIsSaving] = React.useState(isSaving);

    React.useEffect(() => {
      const previouslySaving = wasSaving.current;
      wasSaving.current = isSaving;

      if (isSaving) {
        setDelayedIsSaving(true);
        return;
      }

      const saveJustCompleted =
        previouslySaving && !isSaving && !saveInProgressRef.current;
      if (!saveJustCompleted && saveTick === lastTick.current) return;
      if (saveTick !== undefined && saveTick === lastTick.current) {
        // A save ended without this button's tick changing (it failed, or
        // another button saved) - drop back to idle without a flash.
        setDelayedIsSaving(false);
        return;
      }

      if (saveTick !== undefined) {
        lastTick.current = saveTick;
      }

      // Failed saves skip the success flash and return straight to idle.
      if (!succeeded) {
        setDelayedIsSaving(false);
        return;
      }

      saveInProgressRef.current = true;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        setDelayedIsSaving(false);
        setJustSaved(true);
        setSaveCooldown(true);

        timeoutRef.current = window.setTimeout(() => {
          setJustSaved(false);
          setSaveCooldown(false);
          saveInProgressRef.current = false;
          timeoutRef.current = null;
        }, 600);
      }, 800);
    }, [isSaving, succeeded, saveTick]);

    React.useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    const isPrimary = variant === "primary";
    const isNeutral = variant === "neutral";
    const isLink = variant === "link";

    const baseClass = isLink
      ? "inline-flex items-center cursor-pointer text-ui font-semibold text-text-muted underline-offset-4 transition-colors hover:text-text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
      : cn(
          actionButtonBase,
          isPrimary && actionButtonPrimary,
          isNeutral && actionButtonNeutral,
        );

    const label = isSaving ? savingLabel : justSaved ? savedLabel : children;
    const displayLabel = delayedIsSaving ? savingLabel : label;
    const stateKey = isSaving ? "saving" : justSaved ? "saved" : "idle";

    return (
      <button
        ref={ref}
        type="button"
        className={cn(baseClass, className)}
        disabled={disabled || delayedIsSaving || saveCooldown}
        onClick={onClick}
        aria-live="polite"
        {...rest}
      >
        <span
          key={stateKey}
          className={cn(
            "inline-block",
            justSaved
              ? "animate-fade-in font-bold tracking-tight scale-[1.015]"
              : "animate-fade-in",
          )}
        >
          {displayLabel}
        </span>
      </button>
    );
  },
);
SaveButton.displayName = "SaveButton";

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
    <span className="text-detail font-medium text-text-muted">{label}</span>
    <span className="text-sm font-bold tabular-nums text-text-primary">
      {value}
    </span>
  </span>
);

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
      "group relative flex cursor-pointer flex-col gap-1 overflow-hidden rounded-lg border px-4 py-3 pr-12 text-left transition-[border-color,background] duration-100 hover:border-border-quiet hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
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
          ? "border-brand bg-brand ring-4 ring-brand-ringSoft"
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
  ariaLabel?: string;
  count?: number;
}

interface SegmentedControlProps<Key extends string> {
  value: Key;
  onChange: (next: Key) => void;
  items: SegmentedControlItem<Key>[];
  "aria-label": string;
}

export function SegmentedControl<Key extends string>({
  value,
  onChange,
  items,
  "aria-label": ariaLabel,
}: SegmentedControlProps<Key>): JSX.Element {
  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = items.findIndex((item) => item.key === value);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (items.length === 0) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const currentIndex = activeIndex >= 0 ? activeIndex : 0;
    const nextIndex = (currentIndex + direction + items.length) % items.length;
    onChange(items[nextIndex].key);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-base p-1"
    >
      {items.map((item, index) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={
              item.ariaLabel ??
              (item.label ? undefined : (item.title ?? item.key))
            }
            tabIndex={active || (activeIndex < 0 && index === 0) ? 0 : -1}
            title={item.title}
            onClick={() => onChange(item.key)}
            onKeyDown={handleKeyDown}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-ui font-semibold transition-colors",
              active
                ? "bg-brand-tint text-brand"
                : "text-text-muted hover:bg-brand-soft hover:text-text-primary",
            )}
          >
            {item.icon && <span aria-hidden="true">{item.icon}</span>}
            {item.label}
            {typeof item.count === "number" && (
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-label font-bold tabular-nums transition-colors",
                  active ? "bg-brand-fill text-brand" : "bg-black/5",
                )}
              >
                {item.count}
              </span>
            )}
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
    <span className="text-detail font-medium text-text-muted">{label}</span>
    <span className="text-xl font-extrabold tabular-nums text-text-primary">
      {value}
    </span>
    {hint && (
      <span className="text-detail leading-snug text-text-muted">{hint}</span>
    )}
  </div>
);

interface CustomSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  id,
  value,
  onChange,
  options,
  placeholder = "Velg...",
  className,
  "aria-label": ariaLabel,
}) => {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const generatedId = React.useId();
  const baseId = id ?? generatedId;
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption?.label ?? placeholder;
  const enabledIndexes = options
    .map((opt, index) => (opt.disabled ? -1 : index))
    .filter((index) => index >= 0);

  const openList = () => {
    const selectedIndex = options.findIndex(
      (o) => o.value === value && !o.disabled,
    );
    setActiveIndex(
      selectedIndex >= 0 ? selectedIndex : (enabledIndexes[0] ?? -1),
    );
    setOpen(true);
  };

  const closeList = (focusTrigger: boolean) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };

  const selectOption = (opt: CustomSelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    closeList(true);
  };

  const moveActive = (next: number | undefined) => {
    if (next === undefined) return;
    setActiveIndex(next);
    document
      .getElementById(optionId(next))
      ?.scrollIntoView({ block: "nearest" });
  };

  const handleTriggerKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (!open) {
      if (
        event.key === "Enter" ||
        event.key === " " ||
        event.key === "ArrowDown"
      ) {
        event.preventDefault();
        openList();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(enabledIndexes.find((index) => index > activeIndex));
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(
          [...enabledIndexes].reverse().find((index) => index < activeIndex),
        );
        break;
      case "Home":
        event.preventDefault();
        moveActive(enabledIndexes[0]);
        break;
      case "End":
        event.preventDefault();
        moveActive(enabledIndexes[enabledIndexes.length - 1]);
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const active = options[activeIndex];
        if (active) selectOption(active);
        break;
      }
      case "Escape":
        event.preventDefault();
        closeList(true);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={
          open && activeIndex >= 0 ? optionId(activeIndex) : undefined
        }
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border border-border-muted bg-surface-base px-3 py-2.5 text-sm font-semibold text-text-primary transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft",
          open
            ? "border-brand-input ring-3 ring-brand-ringSoft"
            : "hover:border-brand-strongBorder",
        )}
      >
        <span className={cn(!selectedOption && "font-normal text-text-muted")}>
          {displayLabel}
        </span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn(
            "flex-none text-text-muted transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[200] mt-1 w-full origin-top-left rounded-lg border border-border bg-surface-base shadow-panel animate-fade-in">
          <ul
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className="m-0 max-h-60 list-none overflow-y-auto p-1"
          >
            {options.map((opt, index) => {
              const isSelected = opt.value === value;
              const isActive = index === activeIndex;
              return (
                <li key={opt.value} role="none">
                  <button
                    id={optionId(index)}
                    type="button"
                    tabIndex={-1}
                    disabled={opt.disabled}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => selectOption(opt)}
                    onMouseEnter={() => {
                      if (!opt.disabled) setActiveIndex(index);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm font-semibold transition-colors",
                      opt.disabled
                        ? "cursor-not-allowed text-text-faded"
                        : isSelected
                          ? "bg-brand-soft text-brand"
                          : isActive
                            ? "bg-surface-subtle text-text-primary"
                            : "text-text-primary hover:bg-surface-subtle",
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check size={12} aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
