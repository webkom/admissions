import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";
import type { CandidateSwapTarget } from "./candidateSwapTargets";

interface TwoStepSwapMenuProps {
  /** Where to anchor the popover. */
  anchor: HTMLElement | null;
  /** "Bytt ut" — the candidate the user is removing from this row. */
  sourceName: string;
  /** "Bytt inn" — the candidates the user can pick to replace the source. */
  targets: CandidateSwapTarget[];
  formatTimeLabel: (time: number) => string;
  onPickTarget: (targetScheduleIndex: number) => void;
  onClose: () => void;
  searchPlaceholder: string;
  emptyLabel: string;
}

const TwoStepSwapMenu: React.FC<TwoStepSwapMenuProps> = ({
  anchor,
  sourceName,
  targets,
  formatTimeLabel,
  onPickTarget,
  onClose,
  searchPlaceholder,
  emptyLabel,
}) => {
  // "Bytt ut" is open and the source chip is pre-selected as soon as the
  // popover opens. "Bytt inn" auto-opens once "Bytt ut" is confirmed, so
  // the user only ever sees one expanded dropdown at a time, in the order
  // they need to act in.
  const [outOpen, setOutOpen] = useState(true);
  const [outConfirmed, setOutConfirmed] = useState(false);
  const [inOpen, setInOpen] = useState(false);
  const [pickedTarget, setPickedTarget] = useState<CandidateSwapTarget | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<React.CSSProperties>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const listboxId = `${baseId}-in-listbox`;
  const optionId = (index: number) => `${baseId}-in-option-${index}`;

  const safeTargets = targets;

  const updateMenuPosition = () => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const viewportPadding = 12;
    const menuWidth = Math.max(rect.width, 360);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpwards = spaceBelow < 360 && spaceAbove > spaceBelow;
    const availableHeight = Math.max(
      200,
      Math.min(420, (openUpwards ? spaceAbove : spaceBelow) - viewportPadding),
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
    updateMenuPosition();
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchor?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [anchor, onClose]);

  // Focus the search input as soon as "Bytt inn" opens so the user can type
  // or arrow-key without a second click.
  useEffect(() => {
    if (!inOpen) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [inOpen]);

  const filtered = safeTargets.filter((target) =>
    target.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const enabledIndexes = filtered
    .map((opt, index) => (opt.isConflictFree ? index : -1))
    .filter((index) => index >= 0);

  const moveHighlight = (next: number | undefined) => {
    if (next === undefined) return;
    setHighlightedIndex(next);
    document
      .getElementById(optionId(next))
      ?.scrollIntoView({ block: "nearest" });
  };

  const selectTarget = (target: CandidateSwapTarget) => {
    if (!target.isConflictFree) return;
    setPickedTarget(target);
  };

  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
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
          highlighted && highlighted.isConflictFree
            ? highlighted
            : filtered.find((opt) => opt.isConflictFree);
        if (target) selectTarget(target);
        break;
      }
    }
  };

  // The shared dropdown styling for both "Bytt ut" and "Bytt inn" — same
  // plain chip look so they read as a pair rather than two unrelated widgets.
  const triggerClass = (open: boolean) =>
    cn(
      "inline-flex w-full items-center justify-between gap-1 rounded-md text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring",
      open
        ? "text-brand underline underline-offset-2"
        : "text-text-primary underline-offset-2 hover:underline",
    );

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      style={menuPosition}
      role="dialog"
      aria-label="Bytt kandidat"
      className="fixed z-modal flex origin-top-left flex-col overflow-hidden rounded-lg border border-border bg-surface-base shadow-panel animate-fade-in"
    >
      <div className="border-b border-border-soft bg-surface-subtle px-3 py-2">
        <div className="text-label font-semibold tracking-label text-text-muted">
          Bytt kandidat
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {/* Bytt ut */}
        <div className="flex flex-col gap-1">
          <div className="text-label font-semibold tracking-label text-text-muted">
            Bytt ut
          </div>
          <button
            type="button"
            onClick={() => setOutOpen((prev) => !prev)}
            aria-haspopup="listbox"
            aria-expanded={outOpen}
            className={triggerClass(outOpen)}
          >
            <span className="truncate">{sourceName}</span>
            <ChevronDown
              size={iconSizes.micro}
              aria-hidden="true"
              className={cn(
                "transition-[transform,opacity] duration-150",
                outOpen ? "rotate-180 opacity-100" : "opacity-70",
              )}
            />
          </button>
          {outOpen && (
            <div className="rounded-md border border-border-soft bg-surface-base">
              <ul role="listbox" className="m-0 p-1.5">
                <li role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={outConfirmed}
                    onClick={() => {
                      setOutConfirmed(true);
                      setOutOpen(false);
                      setInOpen(true);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm font-semibold transition-colors",
                      outConfirmed
                        ? "bg-brand-soft text-brand"
                        : "text-text-primary hover:bg-surface-subtle",
                    )}
                  >
                    <span className="truncate">{sourceName}</span>
                    {outConfirmed && (
                      <Check
                        size={iconSizes.compact}
                        aria-hidden="true"
                        className="flex-none"
                      />
                    )}
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Bytt inn */}
        <div className="flex flex-col gap-1">
          <div className="text-label font-semibold tracking-label text-text-muted">
            Bytt inn
          </div>
          <button
            type="button"
            onClick={() => {
              if (outConfirmed) setInOpen((prev) => !prev);
            }}
            disabled={!outConfirmed}
            aria-haspopup="listbox"
            aria-expanded={inOpen}
            className={cn(
              triggerClass(inOpen),
              !outConfirmed && "cursor-not-allowed text-text-faded",
            )}
          >
            <span className="truncate">
              {pickedTarget
                ? `${pickedTarget.name} — ${formatTimeLabel(pickedTarget.time)}`
                : "Velg kandidat å bytte inn…"}
            </span>
            <ChevronDown
              size={iconSizes.micro}
              aria-hidden="true"
              className={cn(
                "transition-[transform,opacity] duration-150",
                inOpen ? "rotate-180 opacity-100" : "opacity-70",
              )}
            />
          </button>
          {inOpen && outConfirmed && (
            <div className="rounded-md border border-border-soft bg-surface-base">
              <div className="border-b border-border-soft bg-surface-subtle px-2.5 py-2">
                <input
                  ref={searchRef}
                  type="search"
                  role="combobox"
                  aria-expanded={inOpen}
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
                  onKeyDown={handleSearchKeyDown}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="w-full rounded-md border border-border-soft bg-surface-base px-2.5 py-1.5 text-sm font-semibold text-text-primary placeholder:font-normal placeholder:text-text-faded focus:border-brand-input focus:outline-none focus:ring-2 focus:ring-brand-ringSoft"
                />
              </div>
              <ul
                id={listboxId}
                role="listbox"
                className="m-0 max-h-72 overflow-y-auto p-1.5"
              >
                {filtered.length === 0 ? (
                  <li role="none">
                    <p className="m-0 px-1.5 py-2 text-detail text-text-muted">
                      {safeTargets.length > 0
                        ? emptyLabel
                        : "Ingen andre kandidater i planen"}
                    </p>
                  </li>
                ) : (
                  filtered.map((target, index) => {
                    const isHighlighted = index === highlightedIndex;
                    const isPicked =
                      pickedTarget?.scheduleIndex === target.scheduleIndex;
                    const prefix = target.isConflictFree ? "✓ " : "⚠️ ";
                    const statusNote =
                      target.status === "confirmed" ? " (Bekreftet)" : "";
                    const dayNote = target.isSameDay ? " (i dag)" : "";
                    const label = `${prefix}${target.name} — ${formatTimeLabel(
                      target.time,
                    )}${statusNote || dayNote}`;
                    return (
                      <li key={target.scheduleIndex} role="none">
                        <button
                          id={optionId(index)}
                          type="button"
                          tabIndex={-1}
                          role="option"
                          aria-selected={isPicked}
                          disabled={!target.isConflictFree}
                          title={target.conflictReason}
                          onClick={() => selectTarget(target)}
                          onMouseEnter={() => {
                            if (target.isConflictFree)
                              setHighlightedIndex(index);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm font-semibold transition-colors",
                            !target.isConflictFree
                              ? "cursor-not-allowed text-text-faded"
                              : isPicked
                                ? "bg-brand-soft text-brand"
                                : isHighlighted
                                  ? "bg-surface-subtle text-text-primary"
                                  : "text-text-primary hover:bg-surface-subtle",
                          )}
                        >
                          <span className="truncate">{label}</span>
                          {!target.isConflictFree ? (
                            <span
                              className={cn(
                                "text-detail font-medium",
                                target.conflictReason === "Inhabil"
                                  ? "text-danger"
                                  : "text-text-muted",
                              )}
                            >
                              {target.conflictReason ?? "I panelet"}
                            </span>
                          ) : isPicked ? (
                            <Check
                              size={iconSizes.compact}
                              aria-hidden="true"
                              className="flex-none"
                            />
                          ) : null}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Confirm / cancel footer. The swap is committed only when both
            dropdowns are confirmed: "Bytt ut" clicked (it is this row's
            candidate) AND a "Bytt inn" target picked. */}
        <div className="flex items-center justify-end gap-2 border-t border-border-soft pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-detail font-semibold text-text-muted hover:text-text-primary"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={() => {
              if (pickedTarget) onPickTarget(pickedTarget.scheduleIndex);
            }}
            disabled={!pickedTarget}
            className={cn(
              "rounded-md px-3 py-1.5 text-detail font-bold transition-colors",
              pickedTarget
                ? "bg-brand text-white hover:bg-brand-hover"
                : "cursor-not-allowed bg-surface-subtle text-text-faded",
            )}
          >
            Bytt
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TwoStepSwapMenu;
