import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, ChevronDown, Clock3 } from "lucide-react";

import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";

export type SchedulingWorkspaceMode = "preview" | "editing";

interface PanelChipOption {
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
          "group/chip inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold",
          editable &&
            "cursor-pointer transition-[border-color,background] duration-100 hover:border-border-quiet hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring",
          open &&
            "border-brand-activeBorder bg-brand-soft shadow-tint-sm -translate-y-px",
          conflict
            ? "border-brand-activeBorder bg-brand-tint text-brand"
            : isCurrentUser
              ? "border-brand-border bg-brand-soft font-bold text-brand"
              : tone === "overtime"
                ? "border-danger-border bg-danger-bg font-semibold text-danger"
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
                          <span className="text-detail font-medium text-text-muted">
                            I panelet
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
