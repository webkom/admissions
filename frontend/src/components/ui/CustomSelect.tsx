import React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import cn from "src/utils/cn";
import { iconSizes } from "src/styles/designTokens";

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
  compact?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-busy"?: boolean;
  title?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  id,
  value,
  onChange,
  options,
  placeholder = "Velg...",
  className,
  compact = false,
  disabled = false,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-busy": ariaBusy,
  title,
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

  const selectedOption = options.find((option) => option.value === value);
  const displayLabel = selectedOption?.label ?? placeholder;
  const enabledIndexes = options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index >= 0);

  const updateMenuPosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const menuWidth = Math.max(rect.width, 192);
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
    const selectedIndex = options.findIndex(
      (option) => option.value === value && !option.disabled,
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

  const selectOption = (option: CustomSelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
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
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
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
        aria-describedby={ariaDescribedBy}
        aria-busy={ariaBusy}
        title={title}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "flex w-full items-center justify-between rounded-xl border border-border-muted bg-surface-base font-semibold text-text-primary transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft",
          compact ? "gap-1 px-2 py-1.5 text-xs" : "gap-2 px-3 py-2.5 text-sm",
          open
            ? "border-brand-input ring-3 ring-brand-ringSoft"
            : "hover:border-brand-strongBorder",
          disabled && "cursor-not-allowed opacity-70",
        )}
        disabled={disabled}
      >
        <span
          className={cn(
            "min-w-0 truncate whitespace-nowrap",
            !selectedOption && "font-normal text-text-muted",
          )}
        >
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
            className="fixed z-modal origin-top-left overflow-y-auto rounded-lg border border-border bg-surface-base shadow-panel animate-fade-in"
          >
            <ul
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              className="m-0 list-none p-1"
            >
              {options.map((option, index) => {
                const isSelected = option.value === value;
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
                      onClick={() => selectOption(option)}
                      onMouseEnter={() => {
                        if (!option.disabled) setActiveIndex(index);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors",
                        option.disabled
                          ? "cursor-not-allowed text-text-faded"
                          : isSelected
                            ? "bg-brand-soft text-brand"
                            : isActive
                              ? "bg-surface-subtle text-text-primary"
                              : "text-text-primary hover:bg-surface-subtle",
                      )}
                    >
                      <span className="truncate">{option.label}</span>
                      {isSelected && (
                        <Check size={iconSizes.compact} aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
};
