import React from "react";
import { Check } from "lucide-react";
import { iconSizes, iconStrokeWidths } from "src/styles/designTokens";
import cn from "src/utils/cn";

export type FoundationWorkspace = "framework" | "availability" | "coverage";

interface FoundationWorkspaceNavProps {
  active: FoundationWorkspace;
  onChange: (workspace: FoundationWorkspace) => void;
  frameworkComplete: boolean;
  availabilityComplete: boolean;
  submittedCount: number;
  participantCount: number;
  frameworkDraftValid?: boolean;
  frameworkHasPendingChanges?: boolean;
}

const workspaceItems = [
  {
    key: "framework",
    title: "Oppsett",
    description: "Tidsrammer og intervjublokker",
  },
  {
    key: "availability",
    title: "Min tilgjengelighet",
    description: "Velg tilgjengelige intervjublokker",
  },
  {
    key: "coverage",
    title: "Tilgjengelighet og dekning",
    description: "Se felles kapasitet og manglende svar",
  },
] as const;

const FoundationWorkspaceNav: React.FC<FoundationWorkspaceNavProps> = ({
  active,
  onChange,
  frameworkComplete,
  availabilityComplete,
  submittedCount,
  participantCount,
  frameworkDraftValid = true,
  frameworkHasPendingChanges = false,
}) => (
  <nav
    aria-label="Delsteg i Grunnlag"
    className="border-b border-border-soft px-12 pt-4 handheld:px-6"
    data-cy="foundation-stage-nav"
  >
    <div
      role="tablist"
      aria-label="Arbeidsområder i Grunnlag"
      className="flex min-h-10 gap-6 overflow-x-auto"
    >
      {workspaceItems.map((item) => {
        const frameworkWarning =
          item.key === "framework" && !frameworkDraftValid
            ? "Ugyldig"
            : item.key === "framework" && frameworkHasPendingChanges
              ? "Ulagret"
              : null;
        const complete =
          item.key === "framework"
            ? frameworkComplete &&
              frameworkDraftValid &&
              !frameworkHasPendingChanges
            : item.key === "availability"
              ? availabilityComplete
              : participantCount > 0 && submittedCount >= participantCount;
        const current = active === item.key;

        const handleKeyDown = (
          event: React.KeyboardEvent<HTMLButtonElement>,
        ) => {
          const currentIndex = workspaceItems.findIndex(
            (workspace) => workspace.key === item.key,
          );
          const direction =
            event.key === "ArrowRight" || event.key === "ArrowDown"
              ? 1
              : event.key === "ArrowLeft" || event.key === "ArrowUp"
                ? -1
                : 0;
          const nextIndex =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? workspaceItems.length - 1
                : direction
                  ? (currentIndex + direction + workspaceItems.length) %
                    workspaceItems.length
                  : null;
          if (nextIndex === null) return;

          event.preventDefault();
          const next = workspaceItems[nextIndex].key;
          onChange(next);
          window.requestAnimationFrame(() => {
            document.getElementById(`foundation-tab-${next}`)?.focus();
          });
        };

        return (
          <button
            key={item.key}
            id={`foundation-tab-${item.key}`}
            type="button"
            role="tab"
            aria-controls={`foundation-panel-${item.key}`}
            aria-selected={current}
            tabIndex={current ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={handleKeyDown}
            data-cy={`foundation-tab-${item.key}`}
            className={cn(
              "relative inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent pb-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
              current
                ? "border-brand text-brand"
                : "text-text-muted hover:text-text-primary",
            )}
            title={item.description}
          >
            {complete && (
              <Check
                size={iconSizes.medium}
                strokeWidth={iconStrokeWidths.emphasis}
                className="text-success"
                aria-hidden="true"
              />
            )}
            <span>{item.title}</span>
            {frameworkWarning && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-label font-semibold",
                  frameworkWarning === "Ugyldig"
                    ? "bg-danger-bg text-danger"
                    : "bg-amber-100 text-amber-900",
                )}
              >
                {frameworkWarning}
              </span>
            )}
            {item.key === "coverage" &&
              frameworkComplete &&
              participantCount > 0 && (
                <span className="text-label font-semibold tabular-nums text-text-subtle">
                  {submittedCount}/{participantCount}
                </span>
              )}
          </button>
        );
      })}
    </div>
  </nav>
);

export default FoundationWorkspaceNav;
