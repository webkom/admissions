import React, { useEffect, useState } from "react";

interface CountDownProps {
  title: string;
  dateString: string;
  completedLabel?: string;
}

const CountDown: React.FC<CountDownProps> = ({
  title,
  dateString,
  completedLabel = "Passert",
}) => {
  const [remainingTotalSeconds, setRemainingTotalSeconds] = useState(() =>
    getRemainingSeconds(dateString),
  );

  useEffect(() => {
    setRemainingTotalSeconds(getRemainingSeconds(dateString));

    const interval = setInterval(() => {
      setRemainingTotalSeconds(getRemainingSeconds(dateString));
    }, 1000);

    return () => clearInterval(interval);
  }, [dateString]);

  const remaining = calculateRemainingUnits(remainingTotalSeconds);
  const isCompleted = remainingTotalSeconds <= 0;

  return (
    <div className="flex w-full min-w-0 flex-col items-center px-2 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 mt-1 truncate text-title font-extrabold text-text-primary">
            {title}
          </h3>
          <p className="m-0 mt-1 text-sm font-semibold text-text-muted">
            {formatMilestoneDate(dateString)}
          </p>
        </div>
        <span
          className={`inline-flex flex-none rounded-full px-2.5 py-1 text-label font-bold uppercase tracking-caps ${
            isCompleted
              ? "bg-surface-subtle text-text-muted"
              : "bg-brand-muted text-brand"
          }`}
        >
          {isCompleted ? completedLabel : "Aktiv"}
        </span>
      </div>
      {isCompleted ? (
        <div className="flex min-h-24 items-center justify-center px-4 pt-6 text-center">
          <p className="m-0 text-sm font-semibold text-text-muted">
            Fristen er passert.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-4 border-t border-border-soft pt-4 handheld:grid-cols-2 handheld:gap-y-3">
          <CountdownItem value={remaining.days} label="Dager" />
          <CountdownItem value={remaining.hours} label="Timer" />
          <CountdownItem value={remaining.minutes} label="Min" />
          <CountdownItem value={remaining.seconds} label="Sek" />
        </div>
      )}
    </div>
  );
};

export default CountDown;

interface CountdownItemProps {
  value: number;
  label: string;
}

const CountdownItem = ({ value, label }: CountdownItemProps) => (
  <div className="min-w-0 px-2 text-center leading-tight">
    <span className="block text-[clamp(1.6rem,3vw,2.35rem)] font-extrabold tabular-nums text-text-strong">
      {value}
    </span>
    <p className="m-0 text-tiny font-bold uppercase tracking-badge-wide text-text-faded">
      {label}
    </p>
  </div>
);

const getRemainingSeconds = (dateString: string) =>
  Math.round((new Date(dateString).valueOf() - new Date().valueOf()) / 1000);

const calculateRemainingUnits = (remainingSeconds: number) => {
  let remaining = Math.max(remainingSeconds, 0);
  const seconds = remaining % 60;
  remaining = (remaining - seconds) / 60;
  const minutes = remaining % 60;
  remaining = (remaining - minutes) / 60;
  const hours = remaining % 24;
  remaining = (remaining - hours) / 24;
  const days = remaining;
  return { days, hours, minutes, seconds };
};

const formatMilestoneDate = (dateString: string) =>
  new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
