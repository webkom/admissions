import React from "react";

interface DraftTaskLayoutProps {
  children: React.ReactNode;
  draft: React.ReactNode;
  stage?: string;
}

const DraftTaskLayout: React.FC<DraftTaskLayoutProps> = ({
  children,
  draft,
  stage,
}) => (
  <div
    className="space-y-3"
    data-cy={stage ? "schedule-task" : undefined}
    data-stage={stage}
  >
    {children}
    <section aria-label="Gjeldende planutkast">{draft}</section>
  </div>
);

export default DraftTaskLayout;
