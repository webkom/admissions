import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart3,
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
  actionButtonPrimary,
  actionButtonNeutral,
} from "./ui";

interface WizardStep {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  title: string;
  description: string;
}

const ADMIN_STEPS: WizardStep[] = [
  {
    icon: Shield,
    label: "Din rolle",
    title: "Du styrer hele prosessen",
    description:
      "Som admin har du ansvaret for å sette opp rammene, sørge for at alle registrerer tilgjengelighet, generere planen og distribuere den. De andre i komiteen trenger bare å gjøre én ting — du gjør resten.",
  },
  {
    icon: LayoutPanelTop,
    label: "Rammer",
    title: "Start med å sette opp rammene",
    description:
      "I «Rammer»-fanen bestemmer du hvilke dager og klokkeslett intervjuene kan holdes, hvor lenge hvert intervju varer, og hvordan blokkene er strukturert. Tidslukene du åpner her er det eneste intervjuerne vil se.",
  },
  {
    icon: CalendarRange,
    label: "Tilgjengelighet",
    title: "Alle registrerer når de kan",
    description:
      "Hver person i komiteen går inn under «Tilgjengelighet» og markerer timene de faktisk kan sitte i intervju. Du ser dekning i Fordeling-fanen.",
  },
  {
    icon: BarChart3,
    label: "Fordeling",
    title: "Sjekk at dekningen er god nok",
    description:
      "Varmekartet i «Fordeling» viser hvor mange intervjuere som er tilgjengelige i hver tidsluke. Jo mørkere farge, jo bedre dekning. Her ser du også hvem i komiteen som har sendt inn tilgjengeligheten sin, og hvem som mangler.",
  },
  {
    icon: Sparkles,
    label: "Intervjuforslag",
    title: "Generer og distribuer planen",
    description:
      "Når tilgjengeligheten er på plass, kjører du solveren under «Intervjuforslag». Den lager en best mulig plan basert på tilgjengelighet, panelstørrelse og dine prioriteringer. Gå igjennom resultatet og trykk «Publiser» når du er fornøyd.",
  },
  {
    icon: CalendarCheck,
    label: "Intervjuplan",
    title: "Følg opp og juster ved behov",
    description:
      "Den distribuerte planen ligger under «Intervjuplan». Her kan du bytte enkeltintervjuere, skru navn av og på, og eksportere til kalender. Alle i komiteen ser planen og kan eksportere intervjuene sine.",
  },
];

const MEMBER_STEPS: WizardStep[] = [
  {
    icon: CalendarRange,
    label: "Tilgjengelighet",
    title: "Marker når du kan sitte i intervju",
    description:
      "Marker tidene du faktisk kan sitte i intervju. Dette er det viktigste du gjør før opptaksansvarlig lager planen.",
  },
  {
    icon: CalendarCheck,
    label: "Intervjuplan",
    title: "Se intervjuene dine når planen er klar",
    description:
      "Når planen er distribuert, ser du intervjuene dine under «Intervjuplan». Der kan du eksportere til kalender og markere eventuell interessekonflikt når kandidatnavn er synlige.",
  },
];

interface WizardTourProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
}

const ADMIN_STORAGE_KEY = "admissions.wizard.admin.v1";
const MEMBER_STORAGE_KEY = "admissions.wizard.member.v1";

// Fallback when localStorage is unavailable (private mode, blocked storage).
const memoryDismissed: Record<string, boolean> = {};

const markDismissed = (storageKey: string) => {
  memoryDismissed[storageKey] = true;
  try {
    localStorage.setItem(storageKey, "1");
  } catch {
    // ignore — in-memory flag still applies for this session
  }
};

export default function WizardTour({
  isOpen,
  onClose,
  isAdmin,
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
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-label="Veiledning"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={handleClose}
      />

      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative z-10 flex w-full max-w-[500px] flex-col overflow-hidden rounded-panel border border-border bg-surface-base shadow-[0_32px_64px_-12px_rgb(40_18_18/0.28)] focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-border-soft px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-label font-bold uppercase tracking-badge-wide text-text-subtle">
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
                  className={cn(
                    "rounded-full transition-[width,background] duration-200",
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
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-subtle hover:text-text-primary"
              aria-label="Lukk"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Step content */}
        <div
          key={step}
          className="flex flex-col gap-5 px-6 py-7 animate-[fade-in_0.18s_ease-out]"
        >
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-brand-fill text-brand">
              <Icon size={20} />
            </span>
            <div>
              <span className="mb-0.5 block text-label font-bold uppercase tracking-label text-text-subtle">
                {current.label}
              </span>
              <h2 className="m-0 text-[1.05rem] font-bold leading-snug text-text-primary">
                {current.title}
              </h2>
            </div>
          </div>

          <p className="m-0 text-ui leading-relaxed text-text-secondary">
            {current.description}
          </p>
        </div>

        {/* Step strip */}
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
                  className={cn(
                    "flex min-w-[76px] flex-1 flex-col items-center gap-1.5 border-r border-border-faint px-3 py-3 text-center transition-colors last:border-r-0",
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
                      <Check size={12} strokeWidth={3} />
                    ) : (
                      <StepIcon size={12} />
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold leading-tight",
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

        {/* Footer nav */}
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
                <ChevronLeft size={14} />
                Forrige
              </button>
            )}

            {isLast ? (
              <button
                type="button"
                onClick={handleComplete}
                className={cn(actionButtonBase, actionButtonPrimary)}
              >
                {isAdmin ? "Sett i gang" : "Forstått!"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => go(step + 1)}
                className={cn(actionButtonBase, actionButtonPrimary)}
              >
                Neste
                <ChevronRight size={14} />
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
      // localStorage unavailable — rely on the in-memory flag
    }
    if (!dismissed) setIsOpen(true);
  }, [storageKey]);

  return { isOpen, open, close, openIfNotDismissed };
}
