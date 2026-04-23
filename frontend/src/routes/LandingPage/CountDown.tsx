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
      <h3 className="mb-2 text-center text-label font-bold uppercase tracking-label text-text-subtle">
        {title}
      </h3>
      {isCompleted ? (
        <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center">
          <span className="inline-flex items-center rounded-full border border-brand-border bg-brand-badge px-3 py-1.5 text-xs font-bold uppercase tracking-badge text-brand">
            {completedLabel}
          </span>
          <p className="m-0 text-sm font-semibold text-text-secondary">
            {formatMilestoneDate(dateString)}
          </p>
        </div>
      ) : (
        <div className="flex w-full flex-wrap justify-center">
          <div className="flex">
            <CountdownItem value={remaining.days} label="DAGER" />
            <CountdownItem value={remaining.hours} label="TIMER" />
          </div>
          <div className="flex">
            <CountdownItem value={remaining.minutes} label="MINUTTER" />
            <CountdownItem value={remaining.seconds} label="SEKUNDER" />
          </div>
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
  <div className="mx-4 mb-4 w-16 text-center leading-tight handheld:mx-2 handheld:w-14">
    <span className="text-countdown font-extrabold text-text-strong handheld:text-display-sm">
      {value}
    </span>
    <p className="m-0 text-tiny font-bold tracking-badge-wide text-text-faded">
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
