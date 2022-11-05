import React from "react";
import { DateTime } from "luxon";

interface FormatTimeProps {
  format: string;
  children: string;
}

const FormatTime: React.FC<FormatTimeProps> = ({ format, children }) => {
  const formatted = DateTime.fromISO(children, { zone: "utc" })
    .setLocale("no")
    .toFormat(format);

  return <span>{formatted}</span>;
};

export default FormatTime;
