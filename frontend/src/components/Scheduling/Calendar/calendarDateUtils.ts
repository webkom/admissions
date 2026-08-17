export interface CalendarDay {
  date: Date;
  isoDate: string;
  isCurrentMonth: boolean;
}

export const parseIsoDate = (value: string): Date | null => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

export const toIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const startOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), 1);

export const moveMonth = (date: Date, offset: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + offset, 1);

export const moveCalendarDateByMonth = (date: Date, offset: number): Date => {
  const targetMonth = date.getMonth() + offset;
  const lastDayOfTargetMonth = new Date(
    date.getFullYear(),
    targetMonth + 1,
    0,
  ).getDate();
  return new Date(
    date.getFullYear(),
    targetMonth,
    Math.min(date.getDate(), lastDayOfTargetMonth),
  );
};

export const calendarDaysForMonth = (month: Date): CalendarDay[] => {
  const firstDay = startOfMonth(month);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(
    firstDay.getFullYear(),
    firstDay.getMonth(),
    1 - mondayOffset,
  );

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
    );
    return {
      date,
      isoDate: toIsoDate(date),
      isCurrentMonth: date.getMonth() === firstDay.getMonth(),
    };
  });
};

export const formatCalendarMonth = (date: Date): string =>
  new Intl.DateTimeFormat("nb-NO", {
    month: "long",
    year: "numeric",
  }).format(date);

export const formatAccessibleCalendarDate = (date: Date): string =>
  new Intl.DateTimeFormat("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
