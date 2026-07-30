import React from "react";
import { createRoot } from "react-dom/client";

import FoundationWorkspaceNav, {
  type FoundationWorkspace,
} from "../../../frontend/src/routes/SchedulePage/FoundationWorkspaceNav";
import WorkflowStepper from "../../../frontend/src/routes/SchedulePage/WorkflowStepper";
import type {
  TabType,
  WorkflowStepDefinition,
} from "../../../frontend/src/routes/SchedulePage/types";
import "../../../frontend/src/styles/globals.css";
import "../../../frontend/src/styles/scheduler.css";

const EmptyIcon: React.FC = () => null;
const steps: WorkflowStepDefinition[] = [
  {
    key: "config",
    title: "Grunnlag",
    description: "Sett rammene og samle tilgjengelighet.",
    icon: EmptyIcon,
    status: "Ferdig",
    tone: "success",
    complete: true,
  },
  {
    key: "solver",
    title: "Planutkast",
    description: "Generer og kontroller utkastet.",
    icon: EmptyIcon,
    status: "Klar",
    tone: "muted",
  },
  {
    key: "plan",
    title: "Publisering",
    description: "Publiser endelige tider.",
    icon: EmptyIcon,
    status: "Låst",
    tone: "locked",
    locked: true,
  },
];

const SchedulerPlanNavigationHarness: React.FC = () => {
  const [activeStep, setActiveStep] = React.useState<TabType>("config");
  const [activeTab, setActiveTab] =
    React.useState<FoundationWorkspace>("framework");
  const [setupDraft, setSetupDraft] = React.useState("");

  const openWorkspace = (workspace: FoundationWorkspace) => {
    setActiveTab(workspace);
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`#foundation-panel-${workspace} h2`)
        ?.focus({ preventScroll: true });
    });
  };

  return (
    <div
      data-cy="navigation-harness"
      style={{ margin: "0 auto", maxWidth: 1152, padding: 24 }}
    >
      <div
        className="overflow-hidden rounded-panel border border-border bg-surface-base shadow-sm"
        data-cy="schedule-stage"
      >
        <WorkflowStepper
          steps={steps}
          activeKey={activeStep}
          onChange={setActiveStep}
        />
        <FoundationWorkspaceNav
          active={activeTab}
          onChange={openWorkspace}
          frameworkComplete
          availabilityComplete
          submittedCount={1}
          participantCount={3}
        />
        <div
          id="foundation-panel-framework"
          role="tabpanel"
          aria-labelledby="foundation-tab-framework"
          hidden={activeTab !== "framework"}
        >
          <h2 tabIndex={-1}>Tidsrammer</h2>
          <span>Intervjublokker</span>
          <input
            aria-label="Ulagret oppsettsendring"
            value={setupDraft}
            onChange={(event) => setSetupDraft(event.target.value)}
          />
        </div>
        <div
          id="foundation-panel-availability"
          role="tabpanel"
          aria-labelledby="foundation-tab-availability"
          hidden={activeTab !== "availability"}
        >
          <h2 tabIndex={-1}>Min personlige tilgjengelighet</h2>
        </div>
        <div
          id="foundation-panel-coverage"
          role="tabpanel"
          aria-labelledby="foundation-tab-coverage"
          hidden={activeTab !== "coverage"}
        >
          <h2 tabIndex={-1}>Dekningsoversikt</h2>
        </div>
      </div>
    </div>
  );
};

const root = document.getElementById("root");
if (!root) throw new Error("Scheduler plan fixture root is missing");
createRoot(root).render(<SchedulerPlanNavigationHarness />);
