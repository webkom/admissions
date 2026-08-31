import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowUpDown, X } from "lucide-react";
import cn from "../../../utils/cn";
import { iconSizes } from "../../../styles/designTokens";
import type { ScheduleItem, SchedulePanelMember } from "../types";
import type { AssignmentAvailabilityStatus } from "../assignmentAvailability";
import type { PanelChipOption } from "../ui";

interface SlotPanelOverrideMenuProps {
  item: ScheduleItem;
  scheduleIndex: number;
  /** All interviewers as replacement options for the chosen seat, greyed out
   *  (with a reason) when a swap is not allowed — already seated, inhabil
   *  against a candidate in the block, or outside their availability. */
  buildReplacementOptions: (
    currentMember: SchedulePanelMember,
  ) => PanelChipOption[];
  onSwapPanelMember: (
    scheduleIndex: number,
    panelMemberIndex: number,
    newName: string,
    newId?: string,
  ) => void;
  shortName: (name: string) => string;
  hasConflictFor?: (
    scheduleIndex: number,
    member: SchedulePanelMember,
  ) => boolean;
  availabilityStatusFor?: (
    item: ScheduleItem,
    member: SchedulePanelMember,
  ) => AssignmentAvailabilityStatus;
}

const SlotPanelOverrideMenu: React.FC<SlotPanelOverrideMenuProps> = ({
  item,
  scheduleIndex,
  buildReplacementOptions,
  onSwapPanelMember,
  shortName,
  hasConflictFor,
  availabilityStatusFor,
}) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"select-member" | "replace">(
    "select-member",
  );
  const [selectedMemberIndex, setSelectedMemberIndex] = useState<number | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<React.CSSProperties>({});

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const menuWidth = 260;
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

  const handleOpen = () => {
    if (item.panel.length === 0) return;
    if (item.panel.length === 1) {
      setSelectedMemberIndex(0);
      setStep("replace");
    } else {
      setSelectedMemberIndex(null);
      setStep("select-member");
    }
    setQuery("");
    setHighlightedIndex(-1);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setStep("select-member");
    setSelectedMemberIndex(null);
    setQuery("");
    setHighlightedIndex(-1);
    triggerRef.current?.focus();
  };

  const handleSelectMember = (idx: number) => {
    setSelectedMemberIndex(idx);
    setStep("replace");
    setQuery("");
    setHighlightedIndex(-1);
  };

  // Auto-focus the search input whenever transitioning into replacement step
  useEffect(() => {
    if (open && step === "replace") {
      const timer = window.setTimeout(() => {
        searchInputRef.current?.focus();
      }, 30);
      return () => window.clearTimeout(timer);
    }
  }, [open, step]);

  // Handle position tracking, escape key, and outside clicks
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        handleClose();
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        handleClose();
      }
    };

    updateMenuPosition();
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
  }, [open]);

  const selectedMember =
    selectedMemberIndex !== null ? item.panel[selectedMemberIndex] : null;

  const replacementOptions: PanelChipOption[] = selectedMember
    ? buildReplacementOptions(selectedMember).filter((option) =>
        option.id && selectedMember.id
          ? option.id !== selectedMember.id
          : option.name !== selectedMember.name,
      )
    : [];

  const filteredOptions = replacementOptions.filter((option) =>
    option.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const stepHighlight = (direction: 1 | -1) => {
    const count = filteredOptions.length;
    if (count === 0) return;
    setHighlightedIndex((prev) => {
      let next = prev < 0 ? (direction === 1 ? -1 : 0) : prev;
      for (let step = 0; step < count; step += 1) {
        next = (next + direction + count) % count;
        if (!filteredOptions[next]?.disabled) return next;
      }
      return prev;
    });
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        stepHighlight(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        stepHighlight(-1);
        break;
      case "Enter": {
        event.preventDefault();
        const highlighted =
          highlightedIndex >= 0 && highlightedIndex < filteredOptions.length
            ? filteredOptions[highlightedIndex]
            : undefined;
        const target =
          highlighted && !highlighted.disabled
            ? highlighted
            : filteredOptions.find((option) => !option.disabled);
        if (target && selectedMemberIndex !== null) {
          onSwapPanelMember(
            scheduleIndex,
            selectedMemberIndex,
            target.name,
            target.id,
          );
          handleClose();
        }
        break;
      }
      case "Escape":
        event.preventDefault();
        if (item.panel.length > 1) {
          setStep("select-member");
          setSelectedMemberIndex(null);
          setQuery("");
        } else {
          handleClose();
        }
        break;
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? handleClose() : handleOpen())}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Bytt intervjuer for dette tidspunktet"
        className={cn(
          "group/btn inline-flex items-center gap-1.5 rounded px-2 py-1 text-ui font-medium transition-colors cursor-pointer",
          open
            ? "bg-brand-soft text-brand ring-1 ring-brand-ring"
            : "text-text-muted/70 hover:bg-surface-subtle hover:text-text-primary",
        )}
      >
        <span>—</span>
        <ArrowUpDown
          size={11}
          aria-hidden="true"
          className={cn(
            "transition-opacity duration-150 text-text-muted",
            open
              ? "opacity-100 text-brand"
              : "opacity-0 group-hover/btn:opacity-100 group-focus-visible/btn:opacity-100",
          )}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={menuPosition}
            className="fixed z-modal flex origin-top-left flex-col overflow-hidden rounded-lg border border-border bg-surface-base shadow-panel animate-fade-in"
          >
            {step === "select-member" ? (
              <div className="flex flex-col">
                <div className="border-b border-border-soft bg-surface-subtle px-3 py-2 text-label font-semibold text-text-muted">
                  Hvem skal byttes ut?
                </div>
                <ul
                  role="listbox"
                  aria-label="Velg panelmedlem som skal byttes ut"
                  className="m-0 max-h-64 overflow-y-auto p-1.5"
                >
                  {item.panel.map((member, idx) => {
                    const isConflicted = hasConflictFor?.(
                      scheduleIndex,
                      member,
                    );
                    const availabilityStatus = availabilityStatusFor?.(
                      item,
                      member,
                    );
                    const hasAvailabilityIssue =
                      availabilityStatus === "outside_submitted_availability" ||
                      availabilityStatus === "availability_not_submitted";

                    return (
                      <li key={`${member.name}-${idx}`} role="none">
                        <button
                          type="button"
                          role="option"
                          onClick={() => handleSelectMember(idx)}
                          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-ui font-semibold text-text-primary transition-colors hover:bg-surface-subtle hover:text-brand"
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate">{member.name}</span>
                            {isConflicted && (
                              <span className="flex-none rounded bg-danger-bg px-1.5 py-0.5 text-nano font-bold text-danger">
                                Inhabil
                              </span>
                            )}
                            {hasAvailabilityIssue && !isConflicted && (
                              <span className="flex-none rounded bg-warning-bgStrong px-1.5 py-0.5 text-nano font-bold text-warning-text">
                                Utenfor tid
                              </span>
                            )}
                          </div>
                          <ArrowUpDown
                            size={iconSizes.compact}
                            aria-hidden="true"
                            className="flex-none text-text-muted opacity-60"
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="flex items-center justify-between border-b border-border-soft bg-surface-subtle px-3 py-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {item.panel.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setStep("select-member");
                          setSelectedMemberIndex(null);
                          setQuery("");
                        }}
                        className="inline-flex cursor-pointer items-center gap-0.5 rounded px-1.5 py-0.5 text-label font-semibold text-text-muted transition-colors hover:bg-surface-base hover:text-text-primary"
                        title="Tilbake til panelmedlemmer"
                      >
                        <ArrowLeft size={iconSizes.tiny} aria-hidden="true" />
                        <span>Tilbake</span>
                      </button>
                    )}
                    <span className="truncate text-label font-semibold text-text-muted">
                      {selectedMember
                        ? `Bytt ${shortName(selectedMember.name)}:`
                        : "Velg erstatter:"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="cursor-pointer rounded p-1 text-text-muted transition-colors hover:text-text-primary"
                    title="Lukk"
                  >
                    <X size={iconSizes.tiny} aria-hidden="true" />
                  </button>
                </div>

                <div className="border-b border-border-soft bg-surface-subtle px-2.5 py-2">
                  <input
                    ref={searchInputRef}
                    type="search"
                    role="combobox"
                    aria-expanded={true}
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setHighlightedIndex(-1);
                    }}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Søk erstatter…"
                    aria-label="Søk erstatter"
                    className="w-full rounded-md border border-border-soft bg-surface-base px-2.5 py-1.5 text-ui font-semibold text-text-primary placeholder:font-normal placeholder:text-text-faded focus:border-brand-input focus:outline-none focus:ring-2 focus:ring-brand-ringSoft"
                  />
                </div>

                <ul
                  id={listboxId}
                  role="listbox"
                  className="m-0 max-h-64 overflow-y-auto p-1.5"
                >
                  {filteredOptions.length === 0 ? (
                    <li role="none">
                      <p className="m-0 px-2 py-3 text-center text-label text-text-muted">
                        Ingen treff
                      </p>
                    </li>
                  ) : (
                    filteredOptions.map((option, index) => {
                      const isHighlighted =
                        index === highlightedIndex && !option.disabled;
                      return (
                        <li key={option.id ?? option.name} role="none">
                          <button
                            id={optionId(index)}
                            type="button"
                            tabIndex={-1}
                            role="option"
                            aria-selected={isHighlighted}
                            disabled={option.disabled}
                            title={option.disabledReason}
                            onClick={() => {
                              if (
                                !option.disabled &&
                                selectedMemberIndex !== null
                              ) {
                                onSwapPanelMember(
                                  scheduleIndex,
                                  selectedMemberIndex,
                                  option.name,
                                  option.id,
                                );
                                handleClose();
                              }
                            }}
                            onMouseEnter={() => {
                              if (!option.disabled) setHighlightedIndex(index);
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-ui font-semibold transition-colors",
                              option.disabled
                                ? "cursor-not-allowed text-text-faded"
                                : cn(
                                    "cursor-pointer text-text-primary",
                                    isHighlighted
                                      ? "bg-surface-subtle"
                                      : "hover:bg-surface-subtle",
                                  ),
                            )}
                          >
                            <span className="truncate">{option.name}</span>
                            {option.disabled && option.disabledReason && (
                              <span
                                className={cn(
                                  "flex-none text-detail font-medium",
                                  option.disabledKind === "inhabil"
                                    ? "text-danger"
                                    : "text-text-muted",
                                )}
                              >
                                {option.disabledReason}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
};

export default SlotPanelOverrideMenu;
