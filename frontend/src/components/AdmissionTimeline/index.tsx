import React from "react";
import cn from "src/utils/cn";

export interface AdmissionTimelineItem {
  title: string;
  dateString: string;
  details?: string[];
}

interface AdmissionTimelineProps {
  items: AdmissionTimelineItem[];
}

const formatDate = (raw: string): string => {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hour = String(d.getHours()).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hour}:${minute}`;
};

const AdmissionTimeline: React.FC<AdmissionTimelineProps> = ({ items }) => {
  const now = Date.now();
  const firstFutureIndex = items.findIndex((item) => {
    const d = new Date(item.dateString);
    return !Number.isNaN(d.getTime()) && d.getTime() >= now;
  });

  return (
    <ol className="m-0 flex list-none flex-col">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const isPast =
          firstFutureIndex === -1 ? true : index < firstFutureIndex;
        const isCurrent = index === firstFutureIndex;

        return (
          <li key={item.title} className="flex gap-4">
            <div className="flex flex-none flex-col items-center">
              <span
                aria-hidden="true"
                className={cn(
                  "relative z-10 mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 transition-colors",
                  isPast && "border-border-muted bg-surface-muted",
                  isCurrent && "animate-pulse-brand border-brand bg-brand",
                  !isPast &&
                    !isCurrent &&
                    "border-brand-activeBorder bg-surface-base",
                )}
              >
                {isPast && (
                  <span className="block h-1.5 w-1.5 rounded-full bg-text-faded" />
                )}
                {isCurrent && (
                  <span className="block h-2 w-2 rounded-full bg-white" />
                )}
              </span>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "w-0.5 flex-1 rounded-full",
                    isPast ? "bg-border-muted" : "bg-border-soft",
                  )}
                />
              )}
            </div>
            <div
              className={cn(
                "min-w-0 flex-1 transition-opacity",
                !isLast && "pb-7",
                isPast && "opacity-55",
              )}
            >
              <h4
                className={cn(
                  "m-0 text-base font-bold",
                  isCurrent
                    ? "text-brand"
                    : isPast
                      ? "text-text-muted"
                      : "text-text-primary",
                )}
              >
                {item.title}
              </h4>
              <p
                className={cn(
                  "m-0 mt-1 text-sm font-semibold tabular-nums",
                  isCurrent
                    ? "text-text-secondary"
                    : isPast
                      ? "text-text-faded"
                      : "text-text-muted",
                )}
              >
                {formatDate(item.dateString)}
              </p>
              {item.details && item.details.length > 0 && (
                <ul
                  className={cn(
                    "m-0 mt-2 list-disc pl-5 text-sm",
                    isPast ? "text-text-faded" : "text-text-muted",
                  )}
                >
                  {item.details.map((detail, i) => (
                    <li key={i}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default AdmissionTimeline;
