import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, ChevronDown, Clock3 } from "lucide-react";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";
import {
  actionButtonBase,
  actionButtonDanger,
  actionButtonGhost,
  actionButtonNeutral,
  actionButtonPrimary,
} from "../ui";

export {
  sectionLabelClass,
  keyboardFocusRingClass,
  actionButtonBase,
  actionButtonPrimary,
  actionButtonNeutral,
  actionButtonGhost,
  actionButtonDanger,
  Chip,
  SaveButton,
  MetaValue,
  Stepper,
  SegmentedControl,
  CustomValueSegmentedControl,
  CustomSelect,
} from "../ui";

interface SchedulePanelProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  dataCy?: string;
  stage?: string;
}

export const SchedulePanel: React.FC<SchedulePanelProps> = ({
  children,
  className,
  id,
  dataCy,
  stage,
}) => (
  <section
    id={id}
    data-cy={dataCy}
    data-stage={stage}
    className={cn(
      "overflow-hidden rounded-panel border border-border bg-surface-base shadow-sm",
      className,
    )}
  >
    {children}
  </section>
);

interface SchedulePanelHeaderProps {
  title: string;
  titleClassName?: string;
  description?: React.ReactNode;
  eyebrow?: string;
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
  chips?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bordered?: boolean;
  headingRef?: React.Ref<HTMLHeadingElement>;
  headingDataCy?: string;
}

export const SchedulePanelHeader: React.FC<SchedulePanelHeaderProps> = ({
  title,
  titleClassName,
  description,
  eyebrow,
  icon: Icon,
  chips,
  actions,
  className,
  bordered = true,
  headingRef,
  headingDataCy,
}) => (
  <header
    className={cn(
      "flex flex-wrap items-start justify-between gap-4 px-12 py-4 handheld:px-6",
      // A header carrying a subtitle opens a section, so it gets more room
      // above it than a plain sub-panel header.
      description && "pt-8",
      bordered && "border-b border-border-soft",
      className,
    )}
  >
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {Icon && (
        <span
          className={cn(
            "inline-flex flex-none items-center justify-center text-brand",
            // Sized to the text block beside it: a lone title, or a title
            // stacked on a subtitle.
            description ? "h-11 w-11" : "mt-0.5 h-7 w-7",
          )}
        >
          <Icon size={description ? iconSizes.hero : iconSizes.standard} />
        </span>
      )}
      <div className="min-w-0">
        {eyebrow && (
          <p className="m-0 mb-1 text-label font-bold uppercase tracking-wide text-text-subtle">
            {eyebrow}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h2
            ref={headingRef}
            tabIndex={-1}
            data-cy={headingDataCy}
            className={cn(
              "m-0 rounded-sm leading-tight text-text-primary focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
              titleClassName,
              // A header carrying a subtitle heads a whole section, so it
              // renders a step up from the plain sub-panel headers.
              description ? "text-xl font-bold" : "text-title font-semibold",
            )}
          >
            {title}
          </h2>
          {chips}
        </div>
        {description && (
          <p className="m-0 mt-1 max-w-prose text-detail text-text-muted">
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
  noPadding?: boolean;
  id?: string;
}

export const SchedulePanelBody: React.FC<SchedulePanelBodyProps> = ({
  children,
  className,
  noPadding = false,
  id,
}) => (
  <div
    id={id}
    className={cn(!noPadding && "px-12 py-4 handheld:px-6", className)}
  >
    {children}
  </div>
);

interface SchedulePanelFooterProps {
  children: React.ReactNode;
  className?: string;
  dataCy?: string;
}

export const SchedulePanelFooter: React.FC<SchedulePanelFooterProps> = ({
  children,
  className,
  dataCy,
}) => (
  <div
    data-cy={dataCy}
    className={cn(
      "flex flex-wrap items-center justify-between gap-3 border-t border-border-soft px-12 py-4 handheld:px-6 handheld:py-3",
      className,
    )}
  >
    {children}
  </div>
);

type SchedulingButtonVariant = "primary" | "secondary" | "quiet" | "danger";

interface SchedulingButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: SchedulingButtonVariant;
}

export const SchedulingButton = React.forwardRef<
  HTMLButtonElement,
  SchedulingButtonProps
>(({ className, variant = "secondary", type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      actionButtonBase,
      variant === "primary" && actionButtonPrimary,
      variant === "secondary" && actionButtonNeutral,
      variant === "quiet" && actionButtonGhost,
      variant === "danger" && actionButtonDanger,
      className,
    )}
    {...props}
  />
));
SchedulingButton.displayName = "SchedulingButton";

interface SchedulingActionBarProps {
  status?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  dataCy?: string;
}

export const SchedulingActionBar: React.FC<SchedulingActionBarProps> = ({
  status,
  actions,
  className,
  dataCy,
}) => (
  <SchedulePanelFooter className={className} dataCy={dataCy}>
    <div className="min-w-0 text-detail text-text-muted" aria-live="polite">
      {status}
    </div>
    {actions && (
      <div className="flex flex-wrap items-center gap-3 handheld:w-full">
        {actions}
      </div>
    )}
  </SchedulePanelFooter>
);

export type SchedulingWorkspaceMode = "preview" | "editing";

export interface PanelChipOption {
  id?: string;
  name: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface EditablePanelChipProps {
  label: string;
  tone?: "neutral" | "overtime";
  conflict?: boolean;
  timeIssue?: boolean;
  statusLabel?: string;
  isCurrentUser?: boolean;
  options?: PanelChipOption[];
  onSelect?: (newName: string, id?: string) => void;
  title?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  /** "chip" (default) is the rounded pill used for panel members; "plain"
   *  renders the label as ordinary text so the chip can double as a table
   *  cell title that opens a swap menu. */
  variant?: "chip" | "plain";
}

export const EditablePanelChip: React.FC<EditablePanelChipProps> = ({
  label,
  tone = "neutral",
  conflict = false,
  timeIssue = false,
  statusLabel,
  isCurrentUser = false,
  options,
  onSelect,
  title,
  searchPlaceholder = "Søk intervjuer…",
  emptyLabel = "Ingen treff",
  variant = "chip",
}) => {
  const editable = !!options && !!onSelect;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<React.CSSProperties>({});
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const updateMenuPosition = () => {
    const chip = chipRef.current;
    if (!chip) return;

    const rect = chip.getBoundingClientRect();
    const viewportPadding = 12;
    const menuWidth = Math.max(rect.width, 256);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpwards = spaceBelow < 300 && spaceAbove > spaceBelow;
    const availableHeight = Math.max(
      160,
      Math.min(360, (openUpwards ? spaceAbove : spaceBelow) - viewportPadding),
    );

    setMenuPosition({
      left: Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - menuWidth - viewportPadding),
      ),
      width: menuWidth,
      top: openUpwards ? undefined : rect.bottom + 6,
      bottom: openUpwards ? window.innerHeight - rect.top + 6 : undefined,
      maxHeight: availableHeight,
    });
  };

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHighlightedIndex(-1);
      return;
    }
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 30);
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !wrapRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    updateMenuPosition();
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  const filtered = open
    ? (options ?? []).filter((opt) =>
        opt.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : [];
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
        aria-label={statusLabel ? `${label}: ${statusLabel}` : label}
        aria-haspopup={editable ? "listbox" : undefined}
        aria-expanded={editable ? open : undefined}
        className={cn(
          "group/chip inline-flex items-center gap-1 text-xs font-semibold",
          variant === "chip"
            ? "rounded-full border px-2 py-1"
            : "rounded-md text-sm",
          editable &&
            "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring",
          editable &&
            variant === "chip" &&
            "transition-[border-color,background] duration-100 hover:border-border-quiet hover:bg-surface-subtle",
          editable &&
            variant === "plain" &&
            "underline-offset-2 hover:underline",
          open &&
            (variant === "chip"
              ? "border-brand-activeBorder bg-brand-soft shadow-tint-sm -translate-y-px"
              : "text-brand"),
          conflict
            ? "border-brand-activeBorder bg-brand-tint text-brand"
            : isCurrentUser
              ? "border-brand-border bg-brand-soft font-bold text-brand"
              : tone === "overtime"
                ? "border-danger-border bg-danger-bg font-semibold text-danger"
                : variant === "plain"
                  ? "text-text-primary"
                  : "border-border-soft bg-surface-subtle text-text-body",
        )}
      >
        {conflict && (
          <AlertTriangle
            size={iconSizes.tiny}
            aria-hidden="true"
            className="flex-none"
          />
        )}
        {timeIssue && !conflict && (
          <Clock3
            size={iconSizes.tiny}
            aria-hidden="true"
            className="flex-none"
          />
        )}
        <span>{label}</span>
        {editable && (
          <ChevronDown
            size={iconSizes.micro}
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
      {editable &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            style={menuPosition}
            className="fixed z-modal flex origin-top-left flex-col overflow-y-auto rounded-lg border border-border bg-surface-base shadow-panel animate-fade-in"
          >
            <div className="border-b border-border-soft bg-surface-subtle px-2.5 py-2">
              <input
                ref={inputRef}
                type="search"
                role="combobox"
                aria-expanded={open}
                aria-controls={listboxId}
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
                className="w-full rounded-md border border-border-soft bg-surface-base px-2.5 py-1.5 text-sm font-semibold text-text-primary placeholder:font-normal placeholder:text-text-faded focus:border-brand-input focus:outline-none focus:ring-2 focus:ring-brand-ringSoft"
              />
            </div>
            <ul id={listboxId} role="listbox" className="m-0 p-1.5">
              {filtered.length === 0 ? (
                <li role="none">
                  <p className="m-0 px-1.5 py-1.5 text-detail text-text-muted">
                    {emptyLabel}
                  </p>
                </li>
              ) : (
                filtered.map((opt, index) => {
                  const isCurrent = opt.name === label;
                  const isHighlighted = index === highlightedIndex;
                  return (
                    <li key={opt.id ?? opt.name} role="none">
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
                          "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm font-semibold transition-colors",
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
                          <Check size={iconSizes.compact} aria-hidden="true" />
                        ) : opt.disabled ? (
                          <span
                            className={cn(
                              "text-detail font-medium",
                              opt.disabledReason === "Inhabil"
                                ? "text-danger"
                                : "text-text-muted",
                            )}
                          >
                            {opt.disabledReason ?? "I panelet"}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body,
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
  className?: string;
  value: TimeValue;
  onChange: (next: TimeValue) => void;
  allowEndOfDay?: boolean;
  bare?: boolean;
  "aria-label": string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
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
  className,
  value,
  onChange,
  allowEndOfDay = false,
  bare = false,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}) => {
  const isEndOfDay = allowEndOfDay && value.h === 24;

  return (
    <div
      id={id}
      role="group"
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      className={cn(
        bare
          ? "inline-flex items-center gap-0.5"
          : "inline-flex h-control-md items-center gap-0.5 rounded-md border border-border-soft bg-surface-base px-2 transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-3 focus-within:ring-brand-ringSoft",
        className,
      )}
    >
      <TimeSegmentField
        max={allowEndOfDay ? 24 : 23}
        committed={value.h}
        onCommit={(h) => onChange({ h, m: h === 24 ? 0 : value.m })}
        aria-label={`${ariaLabel}, time`}
      />
      <span className="select-none text-sm font-bold text-text-subtle">:</span>
      <TimeSegmentField
        max={isEndOfDay ? 0 : 59}
        committed={value.m}
        onCommit={(m) => onChange({ h: value.h, m: isEndOfDay ? 0 : m })}
        aria-label={`${ariaLabel}, minutt`}
      />
    </div>
  );
};
