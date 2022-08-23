import React from "react";
import { DateTime } from "luxon";

const FormatTime = ({ format, children }) => {
  const formatted = DateTime.fromISO(children, { zone: "utc" })
    .setLocale("no")
    .toFormat(format);

  return <span>{formatted}</span>;
};

export default FormatTime;
