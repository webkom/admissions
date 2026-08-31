import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

import { iconSizes } from "src/styles/designTokens";
import cn from "../../../utils/cn";
import {
  actionButtonBase,
  actionButtonNeutral,
  actionButtonPrimary,
  keyboardFocusRingClass,
} from "../ui";

export interface DeviationNextStepAction {
  key: string;
  label: string;
  onClick: () => void;
  dataCy?: string;
  icon?: React.ReactNode;
}

interface DeviationNextStepMenuProps {
  /** The one action the state is recommending. */
  primary: DeviationNextStepAction;
  /** Every other way out of the state. A single one renders beside the
   *  primary; several fold behind a disclosure. */
  secondary?: DeviationNextStepAction[];
}

/**
 * One recommended next step, and a way to see the others.
 *
 * A deviation state usually has several legitimate exits - a partial plan can
 * be extended, hand-edited, published as it stands, or regenerated under new
 * rules. Presenting them as equals makes the user rank four options at the one
 * moment they are least equipped to; presenting one and hiding the rest makes
 * the common path obvious without closing off the others. The props enforce
 * this: there is exactly one primary, and it cannot be omitted.
 */
const DeviationNextStepMenu = ({
  primary,
  secondary = [],
}: DeviationNextStepMenuProps) => {
  const [open, setOpen] = useState(false);
  const inlineSecondary = secondary.length === 1 ? secondary : [];
  const foldedSecondary = secondary.length > 1 ? secondary : [];

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {inlineSecondary.map(({ key, label, onClick, dataCy, icon }) => (
          <button
            key={key}
            type="button"
            onClick={onClick}
            data-cy={dataCy}
            className={cn(actionButtonBase, actionButtonNeutral)}
          >
            {label}
            {icon}
          </button>
        ))}
        {foldedSecondary.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            data-cy="next-step-other-options"
            className={cn(
              "inline-flex items-center gap-1 px-2 py-2 text-detail font-semibold text-text-muted hover:text-text-primary hover:underline",
              keyboardFocusRingClass,
            )}
          >
            Andre valg
            <ChevronDown
              size={iconSizes.small}
              aria-hidden="true"
              className={cn("transition-transform", open && "rotate-180")}
            />
          </button>
        )}
        <button
          type="button"
          onClick={primary.onClick}
          data-cy={primary.dataCy ?? "proposal-primary-action"}
          className={cn(actionButtonBase, actionButtonPrimary)}
        >
          {primary.label}
          {primary.icon}
        </button>
      </div>
      {open && foldedSecondary.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {foldedSecondary.map(({ key, label, onClick, dataCy, icon }) => (
            <button
              key={key}
              type="button"
              onClick={onClick}
              data-cy={dataCy}
              className={cn(actionButtonBase, actionButtonNeutral)}
            >
              {label}
              {icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default DeviationNextStepMenu;
