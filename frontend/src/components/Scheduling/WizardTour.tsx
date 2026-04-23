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
  User,
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
      "Hver person i komiteen går inn under «Min tilgjengelighet» og markerer timene de faktisk kan sitte i intervju. De kan også merke kandidater de kjenner personlig (interessekonflikt). Du ser dekning i Fordeling-fanen.",
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
    icon: User,
    label: "Din rolle",
    title: "Du trenger bare gjøre to ting",
    description:
      "Som intervjuer er jobben din enkel: fortell systemet når du kan og meld fra om du kjenner noen av kandidatene. Admin tar seg av resten — du trenger ikke tenke på oppsett eller generering.",
    tips: [
      "Steg 1: Marker tilgjengelighet under «Min tilgjengelighet».",
      "Steg 2: Sjekk «Intervjuplan» når admin har distribuert planen.",
    ],
  },
  {
    icon: CalendarRange,
    label: "Tilgjengelighet",
    title: "Marker når du kan sitte i intervju",
    description:
      "Under «Min tilgjengelighet» ser du en kalender med de tidslommene admin har åpnet. Klikk og dra for å markere timene du faktisk er ledig. Jo mer nøyaktig du er, jo bedre plan kan solveren lage.",
    tips: [
      "Klikk og dra for å velge flere timeslotter raskt.",
      "Du kan avmarkere ved å klikke på allerede valgte slots.",
      "Husk å trykke «Lagre» til slutt — ellers forsvinner endringene.",
    ],
  },
  {
    icon: CalendarRange,
    label: "Interessekonflikt",
    title: "Kjenner du noen av kandidatene?",
    description:
      "Til høyre for kalenderen finner du feltet for interessekonflikter. Hvis du kjenner en kandidat godt nok til at det ville være upassende å intervjue dem — søk dem opp og merk dem. Admin ser dette når planen lages.",
    tips: [
      "Interessekonflikt gjelder nære venner, familie eller tette bekjentskaper.",
      "Det er bedre å merke for mange enn for få — det er anonymt for kandidatene.",
      "Lagre-knappen i tilgjengelighetsfeltet lagrer også interessekonfliktene dine.",
    ],
  },
  {
    icon: CalendarCheck,
    label: "Intervjuplanen",
    title: "Se intervjuene dine når planen er klar",
    description:
      "Når admin har distribuert planen, dukker den opp under «Intervjuplan». Filtrer på «Mine intervjuer» for å se akkurat hva du skal gjøre. Du kan eksportere direkte til Apple Calendar eller Google Calendar.",
    tips: [
      "Bruk «Eksporter» og velg kalenderen din — intervjuene havner rett inn.",
      "Kandidatnavn kan være skjult — det er admins valg å skru dem på.",
      "Har du feil i panelet ditt? Ta kontakt med admin.",
    ],
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
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-border-soft px-5 py-3">
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
                      ? "h-2 w-2 bg-brand opacity-40 hover:opacity-60"
                      : "h-2 w-2 bg-border-muted hover:bg-border-quiet",
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-detail text-text-muted">
              {step + 1} / {steps.length}
            </span>
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
        <div key={step} className="flex flex-col gap-5 px-6 py-7 animate-[fade-in_0.18s_ease-out]">
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-brand-fill text-brand ring-1 ring-brand-border/60">
              <Icon size={20} />
            </span>
            <div>
              <span className="mb-0.5 block text-label font-bold uppercase tracking-label text-text-subtle">
                {isAdmin ? "Admin" : "Intervjuer"} · {current.label}
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
                  <li key={i} className="flex items-start gap-2 text-ui text-text-secondary">
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
                onClick={handleClose}
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
