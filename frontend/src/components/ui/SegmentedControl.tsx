import React from "react";
import cn from "src/utils/cn";

interface SegmentedControlItem<Key extends string> {
  key: Key;
  label?: string;
  icon?: React.ReactNode;
  title?: string;
  ariaLabel?: string;
  count?: number;
  disabled?: boolean;
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
    let nextIndex = currentIndex;
    for (let offset = 1; offset <= items.length; offset += 1) {
      const candidate =
        (currentIndex + direction * offset + items.length) % items.length;
      if (!items[candidate].disabled) {
        nextIndex = candidate;
        break;
      }
    }
    if (nextIndex === currentIndex) return;
    onChange(items[nextIndex].key);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex h-control-md items-center gap-1 rounded-md border border-border bg-surface-base p-1"
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
            disabled={item.disabled}
            onClick={() => onChange(item.key)}
            onKeyDown={handleKeyDown}
            className={cn(
              "inline-flex h-full cursor-pointer items-center gap-1.5 rounded px-3 text-ui font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-focus disabled:cursor-not-allowed disabled:opacity-45",
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
                  active ? "bg-brand-fill text-brand" : "bg-surface-subtle",
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
