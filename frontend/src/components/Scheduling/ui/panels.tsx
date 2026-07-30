import React from "react";

import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";

interface SchedulePanelProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  dataCy?: string;
  stage?: string;
}

export const SchedulePanel: React.FC<SchedulePanelProps> = ({
  children,
  className,
  id,
  dataCy,
  stage,
}) => (
  <section
    id={id}
    data-cy={dataCy}
    data-stage={stage}
    className={cn(
      "overflow-hidden rounded-panel border border-border bg-surface-base shadow-sm",
      className,
    )}
  >
    {children}
  </section>
);

interface SchedulePanelHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
  chips?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bordered?: boolean;
  headingRef?: React.Ref<HTMLHeadingElement>;
  headingDataCy?: string;
}

export const SchedulePanelHeader: React.FC<SchedulePanelHeaderProps> = ({
  title,
  description,
  eyebrow,
  icon: Icon,
  chips,
  actions,
  className,
  bordered = true,
  headingRef,
  headingDataCy,
}) => (
  <header
    className={cn(
      "flex flex-wrap items-start justify-between gap-4 px-5 py-4 handheld:px-4",
      bordered && "border-b border-border-soft",
      className,
    )}
  >
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {Icon && (
        <span className="mt-0.5 inline-flex h-7 w-7 flex-none items-center justify-center text-brand">
          <Icon size={iconSizes.standard} />
        </span>
      )}
      <div className="min-w-0">
        {eyebrow && (
          <p className="m-0 mb-1 text-label font-bold uppercase tracking-wide text-text-subtle">
            {eyebrow}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h2
            ref={headingRef}
            tabIndex={-1}
            data-cy={headingDataCy}
            className="m-0 rounded-sm text-title font-semibold leading-tight text-text-primary focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"
          >
            {title}
          </h2>
          {chips}
        </div>
        {description && (
          <p className="m-0 mt-1 max-w-prose text-ui text-text-muted">
            {description}
          </p>
        )}
      </div>
    </div>
    {actions && (
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        {actions}
      </div>
    )}
  </header>
);

interface SchedulePanelBodyProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  id?: string;
}

export const SchedulePanelBody: React.FC<SchedulePanelBodyProps> = ({
  children,
  className,
  noPadding = false,
  id,
}) => (
  <div
    id={id}
    className={cn(!noPadding && "px-5 py-4 handheld:px-4", className)}
  >
    {children}
  </div>
);

interface SchedulePanelFooterProps {
  children: React.ReactNode;
  className?: string;
  dataCy?: string;
}

export const SchedulePanelFooter: React.FC<SchedulePanelFooterProps> = ({
  children,
  className,
  dataCy,
}) => (
  <div
    data-cy={dataCy}
    className={cn(
      "flex flex-wrap items-center justify-between gap-3 border-t border-border-soft px-5 py-4 handheld:px-4 handheld:py-3",
      className,
    )}
  >
    {children}
  </div>
);
