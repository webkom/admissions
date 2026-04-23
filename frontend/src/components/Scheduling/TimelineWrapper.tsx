import React from "react";

interface TimelineWrapperProps {
  children?: React.ReactNode;
  $gap?: string;
}

const TimelineWrapper: React.FC<TimelineWrapperProps> = ({
  children,
  $gap,
}) => (
  <div
    className="flex w-full flex-wrap items-stretch"
    style={{ gap: $gap ?? "8px" }}
  >
    {children}
  </div>
);

export default TimelineWrapper;
