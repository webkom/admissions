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
    <div className="flex min-w-0 flex-1 basis-[220px] flex-col items-center rounded-2xl border border-[#eceff3] bg-white px-2 py-4 max-[500px]:w-full">
      <h3 className="mb-4 text-center text-base font-bold text-[#374151]">
        {title}
      </h3>
      {isCompleted ? (
        <div className="flex min-h-[138px] flex-col items-center justify-center gap-2 text-center">
          <span className="inline-flex items-center rounded-full border border-[rgba(178,18,7,0.14)] bg-[rgba(178,18,7,0.08)] px-3 py-[0.35rem] text-xs font-bold uppercase tracking-[0.04em] text-[#b21207]">
            {completedLabel}
          </span>
          <p className="m-0 text-sm font-semibold text-[#6b7280]">
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
  <div className="mb-4 mx-[15px] w-[70px] text-center leading-[1.2] max-[500px]:mx-2 max-[500px]:w-[60px]">
    <span className="text-[2rem] font-extrabold text-[#111827] max-[500px]:text-[1.5rem]">
      {value}
    </span>
    <p className="m-0 text-[0.625rem] font-bold tracking-[0.05em] text-[#9ca3af]">
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
