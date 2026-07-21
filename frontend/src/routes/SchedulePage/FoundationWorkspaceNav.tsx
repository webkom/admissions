import React from "react";
import { Tabs } from "src/components/ui";

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
    title: "Intervjuere og dekning",
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
}) => {
  const statusFor = (key: FoundationWorkspace) => {
    if (key === "framework") {
      if (!frameworkDraftValid) return "Ugyldige endringer";
      if (frameworkHasPendingChanges) return "Endringer ikke lagret";
      return frameworkComplete ? "Rammene er lagret" : "Må konfigureres";
    }
    if (key === "availability") {
      if (!frameworkComplete) return "Venter på oppsett";
      return availabilityComplete ? "Lagret" : "Ikke lagret";
    }
    if (!frameworkComplete) return "Venter på rammer";
    return participantCount > 0
      ? `${submittedCount} av ${participantCount} har svart`
      : "Ingen intervjuere ennå";
  };

  return (
    <div className="mt-2">
      <Tabs
        value={active}
        onChange={onChange}
        aria-label="Arbeidsområder i Grunnlag"
        items={workspaceItems.map((item) => {
          const showCoverageCount =
            item.key === "coverage" &&
            frameworkComplete &&
            participantCount > 0;

          return {
            key: item.key,
            id: `foundation-tab-${item.key}`,
            panelId: `foundation-panel-${item.key}`,
            title: `${item.description}. ${statusFor(item.key)}`,
            label: (
              <>
                <span className="text-sm font-bold">{item.title}</span>
                {showCoverageCount && (
                  <span className="rounded px-1.5 py-0.5 text-label font-semibold tabular-nums text-text-subtle">
                    {submittedCount}/{participantCount}
                  </span>
                )}
              </>
            ),
          };
        })}
      />
    </div>
  );
};

export default FoundationWorkspaceNav;
