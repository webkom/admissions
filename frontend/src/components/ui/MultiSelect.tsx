import React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import cn from "src/utils/cn";
import { iconSizes, iconStrokeWidths } from "src/styles/designTokens";

interface MultiSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /**
   * Heading this option belongs under. Options are rendered in the order they
   * are passed, and a heading is drawn whenever this changes - so the caller
   * decides both the grouping and the order of the groups. Leave it off
   * everywhere for a flat list.
   */
  group?: string;
}

interface MultiSelectProps {
  id?: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
  getSelectionLabel?: (
    selectedOptions: MultiSelectOption[],
    options: MultiSelectOption[],
  ) => string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  selectAllLabel?: string;
  clearAllLabel?: string;
  "aria-label"?: string;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({
  id,
  values,
  onChange,
  options,
  getSelectionLabel,
  placeholder = "Velg...",
  className,
  disabled = false,
  selectAllLabel,
  clearAllLabel,
  "aria-label": ariaLabel,
}) => {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [search, setSearch] = React.useState("");
  const [showBottomFade, setShowBottomFade] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listContainerRef = React.useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = React.useState<React.CSSProperties>(
    {},
  );
  const generatedId = React.useId();
  const baseId = id ?? generatedId;
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const selectedOptions = options.filter((option) =>
    values.includes(option.value),
  );

  const filteredOptions = React.useMemo(
    () =>
      search
        ? options.filter((o) =>
            o.label.toLowerCase().includes(search.toLowerCase()),
          )
        : options,
    [options, search],
  );

  const filteredSelectableOptions = filteredOptions.filter(
    (option) => !option.disabled,
  );
  const filteredSelectedCount = filteredSelectableOptions.filter((option) =>
    values.includes(option.value),
  ).length;

  const enabledIndexes = filteredOptions
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index >= 0);

  const displayLabel = getSelectionLabel
    ? getSelectionLabel(selectedOptions, options)
    : selectedOptions.length > 0
      ? `${selectedOptions.length} valgt`
      : placeholder;

  const updateMenuPosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    // The menu renders at min-w-64 (256px), which can be wider than the
    // trigger. Position by the menu's real width or the right edge escapes
    // the viewport even though `left` itself looks clamped.
    const menuWidth = Math.min(
      Math.max(rect.width, 256),
      window.innerWidth - viewportPadding * 2,
    );
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpwards = spaceBelow < 320 && spaceAbove > spaceBelow;
    const availableHeight = Math.max(
      120,
      Math.min(448, (openUpwards ? spaceAbove : spaceBelow) - viewportPadding),
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
  }, []);

  const openList = () => {
    if (disabled) return;
    const selectedIndex = filteredOptions.findIndex(
      (option) => values.includes(option.value) && !option.disabled,
    );
    setActiveIndex(
      selectedIndex >= 0 ? selectedIndex : (enabledIndexes[0] ?? -1),
    );
    setSearch("");
    setOpen(true);
  };

  const closeList = (focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };

  const toggleOption = (option: MultiSelectOption) => {
    if (option.disabled) return;
    onChange(
      values.includes(option.value)
        ? values.filter((value) => value !== option.value)
        : [...values, option.value],
    );
  };

  const selectAll = () => {
    const disabledValues = filteredOptions
      .filter((option) => option.disabled && values.includes(option.value))
      .map((option) => option.value);
    onChange([
      ...disabledValues,
      ...filteredOptions
        .filter((option) => !option.disabled)
        .map((option) => option.value),
    ]);
  };

  const clearAll = () => {
    onChange(
      values.filter(
        (value) =>
          filteredOptions.find((option) => option.value === value)?.disabled,
      ),
    );
  };

  const moveActive = (next: number | undefined) => {
    if (next === undefined) return;
    setActiveIndex(next);
    document
      .getElementById(optionId(next))
      ?.scrollIntoView({ block: "nearest" });
  };

  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeList(true);
      return;
    }
    if (event.key === "ArrowDown" && enabledIndexes.length > 0) {
      event.preventDefault();
      setActiveIndex(enabledIndexes[0]);
      listContainerRef.current?.focus();
    }
  };

  const handleTriggerKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (disabled) return;
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
        const active = filteredOptions[activeIndex];
        if (active) toggleOption(active);
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

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(enabledIndexes.find((index) => index > activeIndex));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (
          activeIndex <= 0 ||
          enabledIndexes.findIndex((i) => i === activeIndex) === 0
        ) {
          searchRef.current?.focus();
          return;
        }
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
        const active = filteredOptions[activeIndex];
        if (active) toggleOption(active);
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

  const checkBottomFade = React.useCallback(() => {
    const el = listContainerRef.current;
    if (!el) return;
    setShowBottomFade(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }, []);

  // Reset activeIndex when filtered options change
  React.useEffect(() => {
    if (!open) return;
    if (filteredOptions.length > 0) {
      const selectedIdx = filteredOptions.findIndex(
        (o) => values.includes(o.value) && !o.disabled,
      );
      setActiveIndex(
        selectedIdx >= 0 ? selectedIdx : (enabledIndexes[0] ?? -1),
      );
    } else {
      setActiveIndex(-1);
    }
    // Deliberately not tracking every setter this reads: the point is to
    // reset the highlight when the search or the open state changes, not
    // whenever anything else in scope does.
  }, [search, open]);

  // Focus search input when dropdown opens
  React.useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  // Bottom fade: re-check on open and after layout
  React.useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => checkBottomFade());
  }, [open, filteredOptions, checkBottomFade]);

  React.useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !wrapRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    updateMenuPosition();
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  const hasFooter = Boolean(selectAllLabel || clearAllLabel);

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
          disabled && "cursor-not-allowed opacity-70",
        )}
        disabled={disabled}
      >
        <span className="min-w-0 truncate whitespace-nowrap">
          {displayLabel}
        </span>
        <ChevronDown
          size={iconSizes.small}
          aria-hidden="true"
          className={cn(
            "flex-none text-text-muted transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={menuPosition}
            className="fixed z-modal flex min-w-64 flex-col overflow-hidden rounded-lg border border-border bg-surface-base shadow-panel animate-fade-in"
          >
            {/* Search input */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border-soft px-3 py-2">
              <Search
                size={iconSizes.micro}
                className="flex-none text-text-muted"
                aria-hidden="true"
              />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Søk..."
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-text-primary outline-none placeholder:text-text-muted"
                aria-label="Søk blant grupper"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    searchRef.current?.focus();
                  }}
                  className="flex-none cursor-pointer border-0 bg-transparent p-0 text-text-muted hover:text-text-primary"
                  aria-label="Tøm søk"
                >
                  <X size={iconSizes.micro} />
                </button>
              )}
            </div>

            {/* Scrollable options */}
            <div
              ref={listContainerRef}
              className="relative flex-1 overflow-y-auto"
              onScroll={checkBottomFade}
              tabIndex={0}
              role="listbox-container"
              onKeyDown={handleListKeyDown}
            >
              {filteredOptions.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-text-muted">
                  Ingen treff
                </p>
              ) : (
                <ul
                  id={listboxId}
                  role="listbox"
                  aria-label={ariaLabel}
                  aria-multiselectable="true"
                  className="m-0 list-none p-1"
                >
                  {filteredOptions.map((option, index) => {
                    const isSelected = values.includes(option.value);
                    const isActive = index === activeIndex;
                    // Headings are drawn inline rather than by nesting the
                    // options inside per-group lists, so `index` stays the
                    // flat position every keyboard handler above is written
                    // against. Filtering by search can empty a group out
                    // entirely; comparing with the previous surviving option
                    // means its heading disappears with it.
                    const heading =
                      option.group &&
                      option.group !== filteredOptions[index - 1]?.group
                        ? option.group
                        : null;
                    return (
                      <React.Fragment key={option.value}>
                        {heading && (
                          <li
                            role="presentation"
                            className="px-3 pb-1 pt-3 text-tiny font-semibold uppercase tracking-wide text-text-muted first:pt-1"
                          >
                            {heading}
                          </li>
                        )}
                        <li role="none">
                          <button
                            id={optionId(index)}
                            type="button"
                            tabIndex={-1}
                            disabled={option.disabled}
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => toggleOption(option)}
                            onMouseEnter={() => {
                              if (!option.disabled) setActiveIndex(index);
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors",
                              option.disabled
                                ? "cursor-not-allowed text-text-faded"
                                : isActive
                                  ? "bg-surface-subtle text-text-primary"
                                  : "text-text-primary hover:bg-surface-subtle",
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className={cn(
                                "flex h-4 w-4 flex-none items-center justify-center rounded border transition-colors",
                                isSelected
                                  ? "border-brand bg-brand text-white"
                                  : "border-border-muted bg-surface-base",
                              )}
                            >
                              {isSelected && (
                                <Check
                                  size={iconSizes.micro}
                                  strokeWidth={iconStrokeWidths.emphasis}
                                />
                              )}
                            </span>
                            <span className="truncate">{option.label}</span>
                          </button>
                        </li>
                      </React.Fragment>
                    );
                  })}
                </ul>
              )}

              {/* Bottom fade gradient — indicates more options below */}
              {showBottomFade && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none sticky bottom-0 h-8 w-full"
                  style={{
                    background:
                      "linear-gradient(to top, var(--color-surface-base), transparent)",
                  }}
                />
              )}
            </div>

            {/* Sticky footer */}
            {hasFooter && (
              <div className="flex shrink-0 items-center gap-3 border-t border-border-soft bg-surface-base px-3 py-2 text-sm font-semibold">
                {selectAllLabel && (
                  <button
                    type="button"
                    onClick={selectAll}
                    disabled={
                      filteredSelectableOptions.length === 0 ||
                      filteredSelectedCount === filteredSelectableOptions.length
                    }
                    className="cursor-pointer border-0 bg-transparent p-0 text-brand transition-colors hover:underline disabled:cursor-default disabled:text-text-disabled disabled:no-underline"
                  >
                    {selectAllLabel}
                  </button>
                )}
                {clearAllLabel && (
                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={filteredSelectedCount === 0}
                    className="cursor-pointer border-0 bg-transparent p-0 text-brand transition-colors hover:underline disabled:cursor-default disabled:text-text-disabled disabled:no-underline"
                  >
                    {clearAllLabel}
                  </button>
                )}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
};
