import React, { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown } from "lucide-react";
import cn from "src/utils/cn";

export {
  sectionLabelClass,
  actionButtonBase,
  actionButtonPrimary,
  actionButtonNeutral,
  actionButtonGhost,
  actionButtonActive,
  actionButtonDanger,
  Chip,
  SaveButton,
  MetaValue,
  Stepper,
  ToggleCard,
  SegmentedControl,
  StatTile,
  CustomSelect,
} from "../ui";

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
  title: string;
  description?: string;
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
  chips?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bordered?: boolean;
}

export const SchedulePanelHeader: React.FC<SchedulePanelHeaderProps> = ({
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
        <span className="mt-0.5 inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Icon size={17} />
        </span>
      )}
      <div className="min-w-0">
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
  /** Drops the default padding so content can sit flush against the panel. */
  noPadding?: boolean;
}

export const SchedulePanelBody: React.FC<SchedulePanelBodyProps> = ({
  children,
  className,
  noPadding = false,
}) => (
  <div
    className={cn(
      !noPadding && "px-6 py-5 handheld:px-4 handheld:py-4",
      className,
    )}
  >
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

export interface PanelChipOption {
  id?: string;
  name: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface EditablePanelChipProps {
  label: string;
  tone?: "neutral" | "overtime";
  /** Marks the chip with a visible conflict-of-interest warning. */
  conflict?: boolean;
  /** Highlights the chip as the signed-in user. */
  isCurrentUser?: boolean;
  /** When omitted (or empty), the chip renders as a static, non-interactive pill. */
  options?: PanelChipOption[];
  onSelect?: (newName: string, id?: string) => void;
  title?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
}

export const EditablePanelChip: React.FC<EditablePanelChipProps> = ({
  label,
  tone = "neutral",
  conflict = false,
  isCurrentUser = false,
  options,
  onSelect,
  title,
  searchPlaceholder = "Søk intervjuer…",
  emptyLabel = "Ingen treff",
}) => {
  const editable = !!options && !!onSelect;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHighlightedIndex(-1);
      return;
    }
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 30);
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
      window.clearTimeout(focusTimer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const filtered = (options ?? []).filter((opt) =>
    opt.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const enabledIndexes = filtered
    .map((opt, index) => (opt.disabled ? -1 : index))
    .filter((index) => index >= 0);

  const closeAndRefocus = () => {
    setOpen(false);
    chipRef.current?.focus();
  };

  const selectOption = (opt: PanelChipOption) => {
    if (opt.disabled) return;
    onSelect?.(opt.name, opt.id);
    closeAndRefocus();
  };

  const moveHighlight = (next: number | undefined) => {
    if (next === undefined) return;
    setHighlightedIndex(next);
    document
      .getElementById(optionId(next))
      ?.scrollIntoView({ block: "nearest" });
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveHighlight(enabledIndexes.find((index) => index > highlightedIndex));
        break;
      case "ArrowUp": {
        event.preventDefault();
        const upperBound =
          highlightedIndex === -1 ? filtered.length : highlightedIndex;
        moveHighlight(
          [...enabledIndexes].reverse().find((index) => index < upperBound),
        );
        break;
      }
      case "Enter": {
        event.preventDefault();
        const highlighted =
          highlightedIndex >= 0 ? filtered[highlightedIndex] : undefined;
        const target =
          highlighted && !highlighted.disabled
            ? highlighted
            : filtered.find((opt) => !opt.disabled);
        if (target) selectOption(target);
        break;
      }
      case "Escape":
        event.preventDefault();
        closeAndRefocus();
        break;
    }
  };

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        ref={chipRef}
        type="button"
        disabled={!editable}
        onClick={() => editable && setOpen((prev) => !prev)}
        title={title}
        aria-haspopup={editable ? "listbox" : undefined}
        aria-expanded={editable ? open : undefined}
        className={cn(
          "group/chip inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold",
          editable &&
            "cursor-pointer transition-[border-color,background,transform,box-shadow] duration-150 hover:-translate-y-px hover:border-brand-strongBorder hover:bg-brand-soft hover:shadow-tint-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring",
          open &&
            "border-brand-activeBorder bg-brand-soft shadow-tint-sm -translate-y-px",
          conflict
            ? "border-brand-activeBorder bg-brand-tint text-brand"
            : isCurrentUser
              ? "border-brand-border bg-brand-soft font-bold text-brand"
              : tone === "overtime"
                ? "border-brand-panelBorder bg-brand-badge text-brand"
                : "border-border-soft bg-surface-subtle text-text-body",
        )}
      >
        {conflict && (
          <AlertTriangle size={11} aria-hidden="true" className="flex-none" />
        )}
        <span>{label}</span>
        {editable && (
          <ChevronDown
            size={10}
            aria-hidden="true"
            className={cn(
              "transition-[transform,opacity] duration-150",
              open
                ? "rotate-180 opacity-100"
                : "opacity-0 group-hover/chip:opacity-100 group-focus-visible/chip:opacity-100",
            )}
          />
        )}
      </button>
      {editable && open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 origin-top-left rounded-lg border border-border bg-surface-base shadow-panel animate-[fade-in_0.15s_ease-out]">
          <div className="border-b border-border-soft px-2 py-1.5">
            <input
              ref={inputRef}
              type="search"
              role="combobox"
              aria-expanded={filtered.length > 0}
              aria-controls={filtered.length > 0 ? listboxId : undefined}
              aria-activedescendant={
                highlightedIndex >= 0 && highlightedIndex < filtered.length
                  ? optionId(highlightedIndex)
                  : undefined
              }
              aria-autocomplete="list"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlightedIndex(-1);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full bg-transparent px-1 py-1 text-sm font-semibold text-text-primary placeholder:font-normal placeholder:text-text-faded focus:outline-none"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="m-0 px-3 py-2 text-detail text-text-muted">
              {emptyLabel}
            </p>
          ) : (
            <ul
              id={listboxId}
              role="listbox"
              className="m-0 max-h-60 overflow-y-auto p-1"
            >
              {filtered.map((opt, index) => {
                const isCurrent = opt.name === label;
                const isHighlighted = index === highlightedIndex;
                return (
                  <li key={opt.name} role="none">
                    <button
                      id={optionId(index)}
                      type="button"
                      tabIndex={-1}
                      role="option"
                      aria-selected={isCurrent}
                      disabled={opt.disabled}
                      title={opt.disabledReason}
                      onClick={() => selectOption(opt)}
                      onMouseEnter={() => {
                        if (!opt.disabled) setHighlightedIndex(index);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm font-semibold transition-colors",
                        opt.disabled
                          ? "cursor-not-allowed text-text-faded"
                          : isCurrent
                            ? "bg-brand-soft text-brand"
                            : isHighlighted
                              ? "bg-surface-subtle text-text-primary"
                              : "text-text-primary hover:bg-surface-subtle",
                      )}
                    >
                      <span className="truncate">{opt.name}</span>
                      {isCurrent ? (
                        <Check size={12} aria-hidden="true" />
                      ) : opt.disabled ? (
                        <span className="text-label font-bold uppercase tracking-label text-text-faded">
                          I panelet
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export interface TimeValue {
  h: number;
  m: number;
}

interface TimeSegmentInputProps {
  id?: string;
  value: TimeValue;
  onChange: (next: TimeValue) => void;
}

const padSegment = (segment: number) => String(segment).padStart(2, "0");

interface TimeSegmentFieldProps {
  max: number;
  committed: number;
  onCommit: (next: number) => void;
  "aria-label": string;
}

const TimeSegmentField: React.FC<TimeSegmentFieldProps> = ({
  max,
  committed,
  onCommit,
  "aria-label": ariaLabel,
}) => {
  const [text, setText] = useState(padSegment(committed));

  // Sync local text with the committed value unless they already represent
  // the same number (keeps in-progress typing like "9" from snapping to "09").
  useEffect(() => {
    setText((current) => {
      const parsed = Number(current);
      const matchesCommitted =
        current.trim() !== "" &&
        Number.isFinite(parsed) &&
        Math.floor(parsed) === committed;
      return matchesCommitted ? current : padSegment(committed);
    });
  }, [committed]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setText(next);
    // An emptied segment stays empty until blur instead of collapsing to 0.
    if (next.trim() === "") return;
    const parsed = Number(next);
    if (!Number.isFinite(parsed)) return;
    const floored = Math.floor(parsed);
    if (floored >= 0 && floored <= max && floored !== committed) {
      onCommit(floored);
    }
  };

  const handleBlur = () => {
    const parsed = Number(text);
    if (text.trim() === "" || !Number.isFinite(parsed)) {
      setText(padSegment(committed));
      return;
    }
    const clamped = Math.min(max, Math.max(0, Math.floor(parsed)));
    setText(padSegment(clamped));
    if (clamped !== committed) onCommit(clamped);
  };

  return (
    <input
      type="number"
      min={0}
      max={max}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      className="w-8 border-none bg-transparent p-0 text-center text-sm font-bold tabular-nums text-text-primary [-moz-appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      aria-label={ariaLabel}
    />
  );
};

export const TimeSegmentInput: React.FC<TimeSegmentInputProps> = ({
  id,
  value,
  onChange,
}) => (
  <div
    id={id}
    className="inline-flex items-center gap-0.5 rounded-lg border border-border-soft bg-surface-base px-2 py-1.5"
  >
    <TimeSegmentField
      max={23}
      committed={value.h}
      onCommit={(h) => onChange({ h, m: value.m })}
      aria-label="Time"
    />
    <span className="select-none text-sm font-bold text-text-subtle">:</span>
    <TimeSegmentField
      max={59}
      committed={value.m}
      onCommit={(m) => onChange({ h: value.h, m })}
      aria-label="Minutt"
    />
  </div>
);
