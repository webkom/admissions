import React, { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";

import { useFocusTrap } from "./ConfirmDialog";
import {
  actionButtonBase,
  actionButtonPrimary,
  keyboardFocusRingClass,
} from "./ui";

interface HelpStep {
  title: string;
  description: string;
}

const ADMIN_STEPS: HelpStep[] = [
  {
    title: "Grunnlag",
    description: "Sett intervjutider og samle tilgjengelighet.",
  },
  {
    title: "Planutkast",
    description:
      "Lag og juster et internt utkast. Intervjuerne ser bare kandidatene de skal kontrollere.",
  },
  {
    title: "Publisering",
    description: "Kontroller utkastet før endelige tider deles.",
  },
];

const MEMBER_STEPS: HelpStep[] = [
  {
    title: "Mine opplysninger",
    description:
      "Lagre når du kan intervjue. Senere kontrollerer du bare kandidatene du er foreslått til.",
  },
  {
    title: "Intervjuplan",
    description: "Når planen er publisert, finner du endelige tider her.",
  },
];

interface WizardTourProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
}

const HELP_TITLE = "Slik fungerer intervjuplanleggingen";

export default function WizardTour({
  isOpen,
  onClose,
  isAdmin,
}: WizardTourProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const steps = isAdmin ? ADMIN_STEPS : MEMBER_STEPS;

  useFocusTrap(dialogRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center overflow-y-auto bg-overlay px-4 py-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={HELP_TITLE}
        tabIndex={-1}
        className="max-h-modal w-full max-w-lg overflow-y-auto rounded-md border border-border bg-surface-base shadow-modal focus:outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border-soft px-5 py-4">
          <div className="min-w-0">
            <h2 className="m-0 text-title font-semibold leading-tight text-text-primary">
              {HELP_TITLE}
            </h2>
            <p className="m-0 mt-1 max-w-prose text-detail text-text-muted">
              {isAdmin
                ? "Tre deler fra oppsett til publisering."
                : "Dette gjør du før og etter publisering."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "inline-flex h-8 w-8 flex-none items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-subtle hover:text-text-primary",
              keyboardFocusRingClass,
            )}
            aria-label="Lukk"
          >
            <X size={iconSizes.control} aria-hidden="true" />
          </button>
        </header>

        <ol className="m-0 list-none divide-y divide-border-soft px-5 py-1">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 py-4"
            >
              <span
                aria-hidden="true"
                className="pt-0.5 text-detail font-bold tabular-nums text-brand"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <h3 className="m-0 text-ui font-semibold text-text-primary">
                  {step.title}
                </h3>
                <p className="m-0 mt-1 max-w-prose text-detail leading-relaxed text-text-muted">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <footer className="flex justify-end border-t border-border-soft px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className={cn(actionButtonBase, actionButtonPrimary)}
          >
            Lukk
          </button>
        </footer>
      </div>
    </div>
  );
}

export function useWizardTour() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return { isOpen, open, close };
}
