import React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import cn from "src/utils/cn";
import { iconSizes } from "src/styles/designTokens";

export interface MultiSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
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
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
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
  const selectableOptions = options.filter((option) => !option.disabled);
  const selectedSelectableCount = selectableOptions.filter((option) =>
    values.includes(option.value),
  ).length;
  const enabledIndexes = options
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
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpwards = spaceBelow < 280 && spaceAbove > spaceBelow;
    const availableHeight = Math.max(
      120,
      Math.min(448, (openUpwards ? spaceAbove : spaceBelow) - viewportPadding),
    );

    setMenuPosition({
      left: Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - rect.width - viewportPadding),
      ),
      width: rect.width,
      top: openUpwards ? undefined : rect.bottom + 6,
      bottom: openUpwards ? window.innerHeight - rect.top + 6 : undefined,
      maxHeight: availableHeight,
    });
  }, []);

  const openList = () => {
    if (disabled) return;
    const selectedIndex = options.findIndex(
      (option) => values.includes(option.value) && !option.disabled,
    );
    setActiveIndex(
      selectedIndex >= 0 ? selectedIndex : (enabledIndexes[0] ?? -1),
    );
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
    const disabledValues = options
      .filter((option) => option.disabled && values.includes(option.value))
      .map((option) => option.value);
    onChange([
      ...disabledValues,
      ...options
        .filter((option) => !option.disabled)
        .map((option) => option.value),
    ]);
  };

  const clearAll = () => {
    onChange(
      values.filter(
        (value) => options.find((option) => option.value === value)?.disabled,
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
        const active = options[activeIndex];
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
            className="fixed z-modal origin-top-left overflow-y-auto rounded-lg border border-border bg-surface-base p-1 shadow-panel animate-fade-in"
          >
            <ul
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              aria-multiselectable="true"
              className="m-0 list-none p-0"
            >
              {options.map((option, index) => {
                const isSelected = values.includes(option.value);
                const isActive = index === activeIndex;
                return (
                  <li key={option.value} role="none">
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
                          <Check size={iconSizes.micro} strokeWidth={3} />
                        )}
                      </span>
                      <span className="truncate">{option.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {(selectAllLabel || clearAllLabel) && (
              <div className="mt-1 flex items-center gap-3 border-t border-border-soft px-3 pt-2 pb-1 text-sm font-semibold">
                {selectAllLabel && (
                  <button
                    type="button"
                    onClick={selectAll}
                    disabled={
                      selectedSelectableCount === selectableOptions.length
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
                    disabled={selectedSelectableCount === 0}
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
