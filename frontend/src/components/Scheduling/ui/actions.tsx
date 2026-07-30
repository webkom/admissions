import React from "react";

import cn from "src/utils/cn";

import {
  actionButtonBase,
  actionButtonDanger,
  actionButtonGhost,
  actionButtonNeutral,
  actionButtonPrimary,
} from "../../ui";
import { SchedulePanelFooter } from "./panels";

type SchedulingButtonVariant = "primary" | "secondary" | "quiet" | "danger";

interface SchedulingButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: SchedulingButtonVariant;
}

export const SchedulingButton = React.forwardRef<
  HTMLButtonElement,
  SchedulingButtonProps
>(({ className, variant = "secondary", type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      actionButtonBase,
      variant === "primary" && actionButtonPrimary,
      variant === "secondary" && actionButtonNeutral,
      variant === "quiet" && actionButtonGhost,
      variant === "danger" && actionButtonDanger,
      className,
    )}
    {...props}
  />
));
SchedulingButton.displayName = "SchedulingButton";

interface SchedulingActionBarProps {
  status?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  dataCy?: string;
}

export const SchedulingActionBar: React.FC<SchedulingActionBarProps> = ({
  status,
  actions,
  className,
  dataCy,
}) => (
  <SchedulePanelFooter className={className} dataCy={dataCy}>
    <div className="min-w-0 text-detail text-text-muted" aria-live="polite">
      {status}
    </div>
    {actions && (
      <div className="flex flex-wrap items-center gap-3 handheld:w-full">
        {actions}
      </div>
    )}
  </SchedulePanelFooter>
);
