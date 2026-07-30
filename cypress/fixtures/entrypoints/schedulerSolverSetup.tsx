import React from "react";

import SolverSetupPanel from "../../../frontend/src/components/Scheduling/Solver/SolverSetupPanel";
import { DEFAULT_SOLVER_OPTIONS } from "../../../frontend/src/components/Scheduling/Solver/solverHelpers";

const interviewers = [
  {
    id: "interviewer-1",
    name: "Ada",
    availability: [480],
    biased: [],
    has_submitted: true,
    participation: "participating" as const,
    experience_level: "experienced" as const,
  },
  {
    id: "interviewer-2",
    name: "Grace",
    availability: [480],
    biased: [],
    has_submitted: true,
    participation: "participating" as const,
    experience_level: "unknown" as const,
  },
];

export const SolverSetupHarness: React.FC = () => {
  const scenario =
    new URLSearchParams(window.location.search).get("scenario") ?? "ready";
  const blocked = scenario === "blocked";
  const loading = scenario === "loading";
  const [solverOptions, setSolverOptions] = React.useState({
    ...DEFAULT_SOLVER_OPTIONS,
  });
  const [panelSize, setPanelSize] = React.useState(1);
  const [solveCount, setSolveCount] = React.useState(0);
  const [navigationAction, setNavigationAction] = React.useState("");

  return (
    <main data-cy="solver-setup-harness" className="mx-auto max-w-4xl p-6">
      <output data-cy="solve-count" hidden>
        {solveCount}
      </output>
      <output data-cy="navigation-action" hidden>
        {navigationAction}
      </output>
      <SolverSetupPanel
        interviewerCount={interviewers.length}
        experiencedInterviewerCount={1}
        interviewers={interviewers}
        solverOptions={solverOptions}
        onSolverOptionsChange={setSolverOptions}
        onExperienceLevelChange={async () => undefined}
        panelSize={panelSize}
        onPanelSizeChange={setPanelSize}
        readiness={{
          ready: !blocked,
          submittedInterviewers: blocked ? 1 : 2,
          enabledSlotCount: 4,
          totalCapacity: 8,
          neededCapacity: 2,
          conflictCount: 0,
          conflictBlockedCandidates: [],
          capabilityBlockedCandidates: [],
          slotsWithFullPanel: 4,
          usableSlotCount: 4,
        }}
        availabilityReady={!blocked}
        loading={loading}
        error=""
        elapsedMs={800}
        jobStatus={loading ? "RUNNING" : null}
        estimatedSeconds={2}
        lockedCount={0}
        hasProposal={false}
        changeableInterviewCount={0}
        currentDraftReady
        candidateScopeResolved
        regenerationOpen={false}
        onCloseRegeneration={() => undefined}
        onSolve={() => setSolveCount((count) => count + 1)}
        onCancel={() => undefined}
        onOpenAvailability={() => setNavigationAction("availability")}
        onOpenFramework={() => setNavigationAction("framework")}
        onOpenConflictReview={() => setNavigationAction("review")}
      />
    </main>
  );
};
