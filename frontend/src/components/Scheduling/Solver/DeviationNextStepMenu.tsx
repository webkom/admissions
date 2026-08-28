import React from "react";

import cn from "../../../utils/cn";
import {
  actionButtonBase,
  actionButtonNeutral,
  actionButtonPrimary,
} from "../ui";

export interface DeviationNextStepAction {
  key: string;
  label: string;
  onClick: () => void;
  /** The action the state is nudging towards renders primary; every other
   *  exit from the state renders neutral. */
  variant?: "primary" | "neutral";
  dataCy?: string;
  icon?: React.ReactNode;
}

interface DeviationNextStepMenuProps {
  actions: DeviationNextStepAction[];
}

// A deviation state rarely has exactly one sensible next step: a delplan can
// be widened with more days, hand-edited, or regenerated under new rules.
// Render the state's actions left-to-right with the recommended one primary,
// so "what the state wants" and "the other exits" stay visually apart.
const DeviationNextStepMenu = ({ actions }: DeviationNextStepMenuProps) => {
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map(
        ({ key, label, onClick, variant = "neutral", dataCy, icon }) => (
          <button
            key={key}
            type="button"
            onClick={onClick}
            data-cy={dataCy}
            className={cn(
              actionButtonBase,
              variant === "primary" ? actionButtonPrimary : actionButtonNeutral,
            )}
          >
            {label}
            {icon}
          </button>
        ),
      )}
    </div>
  );
};

export default DeviationNextStepMenu;
