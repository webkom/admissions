import React from "react";
import { ArrowRight, CalendarCheck } from "lucide-react";

import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";
import {
  SchedulePanel,
  SchedulePanelBody,
  actionButtonBase,
  actionButtonPrimary,
} from "../ui";

interface PublishedPlanNoticeProps {
  stage: string;
  title: string;
  description: string;
  onOpenPlan: () => void;
}

const PublishedPlanNotice: React.FC<PublishedPlanNoticeProps> = ({
  stage,
  title,
  description,
  onOpenPlan,
}) => (
  <SchedulePanel dataCy="schedule-stage" stage={stage}>
    <SchedulePanelBody className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-success-bg text-success">
          <CalendarCheck size={iconSizes.feature} aria-hidden="true" />
        </span>
        <div>
          <h2 className="m-0 text-ui font-bold text-text-primary">{title}</h2>
          <p className="m-0 mt-0.5 text-ui text-text-muted">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenPlan}
        className={cn(actionButtonBase, actionButtonPrimary)}
      >
        Åpne intervjuplan
        <ArrowRight size={iconSizes.medium} aria-hidden="true" />
      </button>
    </SchedulePanelBody>
  </SchedulePanel>
);

export default PublishedPlanNotice;
