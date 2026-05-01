import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  CalendarCheck,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  LayoutPanelTop,
  Lightbulb,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import cn from "src/utils/cn";
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
  tips?: string[];
}

const ADMIN_STEPS: WizardStep[] = [
  {
    icon: Shield,
    label: "Din rolle",
    title: "Du styrer hele prosessen",
    description:
      "Som admin har du ansvaret for å sette opp rammene, sørge for at alle registrerer tilgjengelighet, generere planen og distribuere den. De andre i komiteen trenger bare å gjøre én ting — du gjør resten.",
    tips: [
      "Flyten er: Rammer → Tilgjengelighet → Fordeling → Intervjuforslag → Distribuer.",
      "Du kan gå tilbake og justere i hvilket som helst steg underveis.",
    ],
  },
  {
    icon: LayoutPanelTop,
    label: "Rammer",
    title: "Start med å sette opp rammene",
    description:
      "I «Rammer»-fanen bestemmer du hvilke dager og klokkeslett intervjuene kan holdes, hvor lenge hvert intervju varer, og hvordan blokkene er strukturert. Tidslommene du åpner her er det eneste intervjuerene vil se.",
    tips: [
      "Klikk og dra i rutenettet for å åpne eller stenge tidslommer raskt.",
      "«Velg alle» i kolonneoverskriften åpner hele dagen på én gang.",
      "Husk å trykke «Lagre» — endringer vises ikke for andre før du gjør det.",
    ],
  },
  {
    icon: CalendarRange,
    label: "Tilgjengelighet",
    title: "Alle registrerer når de kan",
    description:
      "Hver person i komiteen går inn under «Min tilgjengelighet» og markerer timene de faktisk kan sitte i intervju. Du ser dekning i Fordeling-fanen.",
    tips: [
      "Purr komiteen tidlig — solveren trenger alle data for å lage en god plan.",
      "Du kan se hvem som har registrert seg under Fordeling-fanen.",
    ],
  },
  {
    icon: BarChart3,
    label: "Fordeling",
    title: "Sjekk at dekningen er god nok",
    description:
      "Varmekartet i «Fordeling» viser hvor mange intervjuere som er tilgjengelige i hvert tidslomme. Jo mørkere farge, jo bedre dekning. Her ser du også listen over registrerte kandidater.",
    tips: [
      "Mål: minst 2–3 tilgjengelige per tidslomme for å gi solveren nok å jobbe med.",
      "Bruk filteret for kjønn eller enkeltperson for å finne hull.",
    ],
  },
  {
    icon: Sparkles,
    label: "Intervjuforslag",
    title: "Generer og distribuer planen",
    description:
      "Når tilgjengeligheten er på plass, kjører du solveren under «Intervjuforslag». Den lager en optimal plan basert på tilgjengelighet, panelstørrelse og dine prioriteringer. Gå igjennom resultatet og trykk «Distribuer» når du er fornøyd.",
    tips: [
      "Juster panelstørrelse og prioritering (overtid vs. jevn fordeling) etter behov.",
      "Klikk på et panelmedlem for å bytte dem ut med noen andre.",
      "Distribuer gjør planen synlig for alle i komiteen — du kan trekke tilbake og justere.",
    ],
  },
  {
    icon: CalendarCheck,
    label: "Intervjuplan",
    title: "Følg opp og juster ved behov",
    description:
      "Den distribuerte planen ligger under «Intervjuplan». Her kan du bytte enkeltintervjuere, skru navn av og på, og eksportere til kalender. Alle i komiteen ser planen og kan eksportere intervjuene sine.",
    tips: [
      "Kandidatnavn er skjulte til du aktiverer dem — bra for å unngå bias.",
      "Klikk et kandidatnavn for å merke interessekonflikt direkte fra planen.",
      "CSV-eksporten kan importeres til Google Regneark for videre behandling.",
    ],
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
    label: "Intervjuplanen",
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
      try {
        localStorage.setItem(
          isAdmin ? ADMIN_STORAGE_KEY : MEMBER_STORAGE_KEY,
          "1",
        );
      } catch {
        // ignore
      }
    }
    onClose();
  }, [dontShow, isAdmin, onClose]);

  const handleComplete = useCallback(() => {
    try {
      localStorage.setItem(
        isAdmin ? ADMIN_STORAGE_KEY : MEMBER_STORAGE_KEY,
        "1",
      );
    } catch {
      // ignore
    }
    onClose();
  }, [isAdmin, onClose]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowRight" && !isLast) go(step + 1);
      if (e.key === "ArrowLeft" && !isFirst) go(step - 1);
    },
    [isOpen, step, isLast, isFirst, go, handleClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

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

      <div className="relative z-10 flex w-full max-w-[500px] flex-col overflow-hidden rounded-panel border border-border bg-surface-base shadow-[0_32px_64px_-12px_rgba(0,0,0,0.25)]">
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
                        ? "h-2 w-2 bg-green-500 hover:bg-green-600"
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
                {isAdmin ? "Admin" : "Medlem"} · {current.label}
              </span>
              <h2 className="m-0 text-[1.05rem] font-bold leading-snug text-text-primary">
                {current.title}
              </h2>
            </div>
          </div>

          <p className="m-0 text-ui leading-relaxed text-text-secondary">
            {current.description}
          </p>

          {current.tips && current.tips.length > 0 && (
            <div className="rounded-xl border border-brand-border bg-brand-soft px-4 py-3.5">
              <div className="mb-2.5 flex items-center gap-1.5 text-label font-bold uppercase tracking-label text-brand">
                <Lightbulb size={11} />
                Tips
              </div>
              <ul className="m-0 flex flex-col gap-2 pl-0">
                {current.tips.map((tip, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-ui text-text-secondary"
                  >
                    <span className="mt-[7px] h-1 w-1 flex-none rounded-full bg-brand/50" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
                      <span className="text-[9px] font-bold">✓</span>
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
    try {
      if (!localStorage.getItem(storageKey)) {
        setIsOpen(true);
      }
    } catch {
      setIsOpen(true);
    }
  }, [storageKey]);

  return { isOpen, open, close, openIfNotDismissed };
}
