import React from "react";
import cn from "src/utils/cn";

export interface TabItem<Key extends string> {
  key: Key;
  label: React.ReactNode;
  panelId: string;
  id: string;
  disabled?: boolean;
  title?: string;
}

interface TabsProps<Key extends string> {
  value: Key;
  onChange: (next: Key) => void;
  items: readonly TabItem<Key>[];
  "aria-label": string;
}

/**
 * The shared local-navigation primitive. Arrow-key movement activates the
 * newly focused destination, matching the application's compact tab controls.
 */
export function Tabs<Key extends string>({
  value,
  onChange,
  items,
  "aria-label": ariaLabel,
}: TabsProps<Key>): JSX.Element {
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    const enabledIndexes = items.flatMap((item, itemIndex) =>
      item.disabled ? [] : [itemIndex],
    );
    if (enabledIndexes.length === 0) return;

    event.preventDefault();
    const currentEnabledIndex = Math.max(0, enabledIndexes.indexOf(index));
    const nextEnabledIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? enabledIndexes.length - 1
          : (currentEnabledIndex +
              (event.key === "ArrowRight" ? 1 : -1) +
              enabledIndexes.length) %
            enabledIndexes.length;
    const nextIndex = enabledIndexes[nextEnabledIndex];
    onChange(items[nextIndex].key);
    requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus());
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex min-h-12 w-full flex-wrap items-stretch gap-x-1 border-t border-border-faint bg-surface-base px-2"
    >
      {items.map((item, index) => {
        const selected = item.key === value;
        return (
          <button
            key={item.key}
            ref={(button) => {
              tabRefs.current[index] = button;
            }}
            type="button"
            disabled={item.disabled}
            role="tab"
            id={item.id}
            aria-controls={item.panelId}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            title={item.title}
            onClick={() => onChange(item.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "group flex min-h-12 min-w-0 items-center gap-2 border-b-2 px-3 py-2.5 text-left transition-[border-color,color,transform] duration-150",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-focus active:translate-y-px",
              selected
                ? "border-brand text-brand"
                : item.disabled
                  ? "cursor-not-allowed border-transparent text-text-disabled"
                  : "border-transparent text-text-muted hover:border-border-quiet hover:text-text-primary",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
