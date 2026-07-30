import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  CalendarCheck,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutPanelTop,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import cn from "src/utils/cn";
import { useFocusTrap } from "./ConfirmDialog";
import {
  actionButtonBase,
  keyboardFocusRingClass,
  actionButtonPrimary,
  actionButtonNeutral,
} from "./ui";
import { iconSizes, iconStrokeWidths } from "src/styles/designTokens";

interface WizardStep {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  title: string;
  description: string;
  target?: WizardTarget;
}

type WizardTarget =
  | "config"
  | "my-availability"
  | "heatmap"
  | "solver"
  | "plan";

const ADMIN_STEPS: WizardStep[] = [
  {
    icon: Shield,
    label: "Din rolle",
    title: "Du styrer hele prosessen",
    description:
      "Som admin setter du rammene, følger opp tilgjengelighet og publiserer den ferdige planen.",
  },
  {
    icon: LayoutPanelTop,
    label: "Grunnlag",
    title: "Sett rammene og samle tilgjengelighet",
    description:
      "Velg intervjutider og følg opp hvem som har svart. Tilgjengelighet er det eneste som må være klart før første planutkast.",
    target: "config",
  },
  {
    icon: Sparkles,
    label: "Planutkast",
    title: "Generer først, kontroller etterpå",
    description:
      "Lag et internt forslag. Intervjuerne ser bare kandidatene de er foreslått til, og solveren reparerer eventuelle inhabiliteter med færrest mulig endringer.",
    target: "solver",
  },
  {
    icon: CalendarCheck,
    label: "Publisering",
    title: "Publiser først når kontrollen er ferdig",
    description:
      "Se over utkastet og publiser endelige tider. Etterpå bruker du samme side til invitasjoner og oppfølging.",
    target: "plan",
  },
];

const MEMBER_STEPS: WizardStep[] = [
  {
    icon: CalendarRange,
    label: "Mine opplysninger",
    title: "Lagre tider, og kontroller en kort kandidatliste senere",
    description:
      "Først markerer du når du kan sitte i intervju. Når et internt utkast finnes, vises bare kandidatene som er foreslått til deg - uten tidspunkt.",
    target: "my-availability",
  },
  {
    icon: CalendarCheck,
    label: "Intervjuplan",
    title: "Se intervjuene dine når planen er klar",
    description:
      "Når kontrollen er ferdig og planen publiseres, ser du endelige tider under «Intervjuplan». Planen er skrivebeskyttet.",
    target: "plan",
  },
];

interface WizardTourProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onNavigate: (target: WizardTarget) => void;
}

const ADMIN_STORAGE_KEY = "admissions.wizard.admin.v1";
const MEMBER_STORAGE_KEY = "admissions.wizard.member.v1";

const memoryDismissed: Record<string, boolean> = {};

const markDismissed = (storageKey: string) => {
  memoryDismissed[storageKey] = true;
  try {
    localStorage.setItem(storageKey, "1");
  } catch {
    return;
  }
};

export default function WizardTour({
  isOpen,
  onClose,
  isAdmin,
  onNavigate,
}: WizardTourProps) {
  const steps = isAdmin ? ADMIN_STEPS : MEMBER_STEPS;
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(0);
      setDontShow(false);
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  const current = steps[step];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;

  const go = useCallback((next: number) => setStep(next), []);

  const handleClose = useCallback(() => {
    if (dontShow) {
      markDismissed(isAdmin ? ADMIN_STORAGE_KEY : MEMBER_STORAGE_KEY);
    }
    onClose();
  }, [dontShow, isAdmin, onClose]);

  const handleComplete = useCallback(() => {
    markDismissed(isAdmin ? ADMIN_STORAGE_KEY : MEMBER_STORAGE_KEY);
    onClose();
  }, [isAdmin, onClose]);

  const handleNavigate = useCallback(() => {
    if (!current.target) return;
    onNavigate(current.target);
    onClose();
  }, [current.target, onClose, onNavigate]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowRight" && !isLast) go(step + 1);
      if (e.key === "ArrowLeft" && !isFirst) go(step - 1);
    },
    [step, isLast, isFirst, go, handleClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  useEffect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [visible]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, visible);

  if (!visible) return null;

  const Icon = current.icon;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-label="Veiledning"
    >
      <div
        className="absolute inset-0 bg-overlay backdrop-blur-sm"
        onClick={handleClose}
      />

      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-panel border border-border bg-surface-base shadow-modal focus:outline-none"
      >
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          Steg {step + 1} av {steps.length}: {current.title}
        </p>
        <div className="flex items-center justify-between border-b border-border-soft px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-detail font-medium text-text-muted">
              Opptaksflyt
            </span>
            <span className="h-1 w-1 rounded-full bg-text-faded" />
            <span className="text-detail font-bold text-text-muted">
              Steg {step + 1} av {steps.length}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              {steps.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Steg ${i + 1}`}
                  aria-current={i === step ? "step" : undefined}
                  className={cn(
                    "rounded-full transition-[width,background] duration-200 motion-reduce:transition-none",
                    keyboardFocusRingClass,
                    i === step
                      ? "h-2 w-5 bg-brand"
                      : i < step
                        ? "h-2 w-2 bg-success hover:opacity-80"
                        : "h-2 w-2 bg-border-muted hover:bg-border-quiet",
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-subtle hover:text-text-primary",
                keyboardFocusRingClass,
              )}
              aria-label="Lukk"
            >
              <X size={iconSizes.control} />
            </button>
          </div>
        </div>

        <div
          key={step}
          className="flex flex-col gap-5 px-6 py-7 animate-fade-in motion-reduce:animate-none"
        >
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-brand-fill text-brand">
              <Icon size={iconSizes.feature} />
            </span>
            <div>
              <span className="mb-0.5 block text-detail font-medium text-text-muted">
                {current.label}
              </span>
              <h2 className="m-0 text-title font-bold leading-snug text-text-primary">
                {current.title}
              </h2>
            </div>
          </div>

          <p className="m-0 text-ui leading-relaxed text-text-secondary">
            {current.description}
          </p>
          {current.target && (
            <button
              type="button"
              onClick={handleNavigate}
              className={cn(
                actionButtonBase,
                actionButtonNeutral,
                "self-start",
              )}
            >
              Åpne {current.label.toLocaleLowerCase("nb-NO")}
            </button>
          )}
        </div>

        <div className="overflow-x-auto border-t border-border-soft">
          <div className="flex min-w-max">
            {steps.map((s, i) => {
              const StepIcon = s.icon;
              const isActive = i === step;
              const isDone = i < step;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => go(i)}
                  aria-current={isActive ? "step" : undefined}
                  className={cn(
                    "flex min-w-20 flex-1 flex-col items-center gap-1.5 border-r border-border-faint px-3 py-3 text-center transition-colors last:border-r-0",
                    keyboardFocusRingClass,
                    isActive ? "bg-brand-soft" : "hover:bg-surface-subtle",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full",
                      isActive
                        ? "bg-brand text-white"
                        : isDone
                          ? "bg-brand-fill text-brand"
                          : "bg-surface-neutral text-text-muted",
                    )}
                  >
                    {isDone ? (
                      <Check
                        size={iconSizes.compact}
                        strokeWidth={iconStrokeWidths.emphasis}
                      />
                    ) : (
                      <StepIcon size={iconSizes.compact} />
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-tiny font-semibold leading-tight",
                      isActive ? "text-brand" : "text-text-muted",
                    )}
                  >
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border-soft px-5 py-3.5">
          {isLast ? (
            <label className="flex cursor-pointer select-none items-center gap-2 text-detail text-text-muted">
              <input
                type="checkbox"
                checked={dontShow}
                onChange={(e) => setDontShow(e.target.checked)}
              />
              Ikke vis igjen
            </label>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={() => go(step - 1)}
                className={cn(actionButtonBase, actionButtonNeutral, "px-3")}
              >
                <ChevronLeft size={iconSizes.control} />
                Forrige
              </button>
            )}

            {isLast ? (
              <button
                type="button"
                onClick={handleComplete}
                className={cn(actionButtonBase, actionButtonPrimary)}
              >
                {isAdmin ? "Kom i gang" : "Forstått"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => go(step + 1)}
                className={cn(actionButtonBase, actionButtonPrimary)}
              >
                Neste
                <ChevronRight size={iconSizes.control} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function useWizardTour(isAdmin: boolean) {
  const storageKey = isAdmin ? ADMIN_STORAGE_KEY : MEMBER_STORAGE_KEY;
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const openIfNotDismissed = useCallback(() => {
    let dismissed = memoryDismissed[storageKey] ?? false;
    try {
      dismissed = dismissed || Boolean(localStorage.getItem(storageKey));
    } catch {
      dismissed = memoryDismissed[storageKey] ?? false;
    }
    if (!dismissed) setIsOpen(true);
  }, [storageKey]);

  return { isOpen, open, close, openIfNotDismissed };
}
