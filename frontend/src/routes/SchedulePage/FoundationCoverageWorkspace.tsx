import React from "react";
import { ArrowRight } from "lucide-react";
import AvailabilityHeatmap from "src/components/Scheduling/Calendar/AvailabilityHeatmap";
import { normalizeSolverOptions } from "src/components/Scheduling/Solver/solverHelpers";
import { SchedulingButton } from "src/components/Scheduling/ui";
import { iconSizes } from "src/styles/designTokens";
import type { ExperienceLevel, Interviewer, SavedSchedule } from "src/types";
import type { FoundationWorkspace } from "./FoundationWorkspaceNav";
import MemberAvailabilityPending from "./MemberAvailabilityPending";

interface FoundationCoverageWorkspaceProps {
  activeWorkspace: FoundationWorkspace;
  hasConfiguredAvailabilityWindows: boolean;
  foundationNav: React.ReactNode;
  dates: string[];
  interviewers: Interviewer[];
  enabledSlots: Set<string>;
  savedSchedule: SavedSchedule | undefined;
  sessionDuration: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  dayStartMinute: number;
  dayEndMinute: number;
  coverageReady: boolean;
  submittedCount: number;
  participantCount: number;
  onParticipationChange: (
    userId: string,
    participation: "awaiting_response" | "not_participating",
  ) => Promise<void>;
  onExperienceLevelChange: (
    userId: string,
    experienceLevel: ExperienceLevel,
  ) => Promise<void>;
  onCreateDraft: () => void;
}

const FoundationCoverageWorkspace: React.FC<
  FoundationCoverageWorkspaceProps
> = ({
  activeWorkspace,
  hasConfiguredAvailabilityWindows,
  foundationNav,
  dates,
  interviewers,
  enabledSlots,
  savedSchedule,
  sessionDuration,
  chunkSize,
  chunkBreakMinutes,
  dayStartMinute,
  dayEndMinute,
  coverageReady,
  submittedCount,
  participantCount,
  onParticipationChange,
  onExperienceLevelChange,
  onCreateDraft,
}) => (
  <div
    id="foundation-panel-coverage"
    role="tabpanel"
    aria-labelledby="foundation-tab-coverage"
    hidden={activeWorkspace !== "coverage"}
    className={
      activeWorkspace === "coverage" ? "flex flex-col gap-3" : "hidden"
    }
  >
    {!hasConfiguredAvailabilityWindows ? (
      <MemberAvailabilityPending
        title="Ingen dekning å vise ennå"
        description="Når oppsettet er lagret, kan du se intervjuernes svar, manglende svar og samlet kapasitet her."
        foundationNav={foundationNav}
      />
    ) : (
      <AvailabilityHeatmap
        dates={dates}
        interviewers={interviewers}
        availableSlots={enabledSlots}
        panelSize={savedSchedule?.panel_size ?? 3}
        samePanelPerBlock={
          savedSchedule
            ? normalizeSolverOptions(savedSchedule.solver_options ?? {})
                .panel_stability === "required"
            : false
        }
        sessionDuration={sessionDuration}
        chunkSize={chunkSize}
        chunkBreakMinutes={chunkBreakMinutes}
        dayStartMinute={dayStartMinute}
        dayEndMinute={dayEndMinute}
        onParticipationChange={onParticipationChange}
        onExperienceLevelChange={onExperienceLevelChange}
        stage={
          coverageReady
            ? "foundation-coverage-ready"
            : "foundation-coverage-waiting"
        }
        foundationNav={
          activeWorkspace === "coverage" ? foundationNav : undefined
        }
        footerAction={
          coverageReady ? (
            <SchedulingButton
              variant="primary"
              onClick={onCreateDraft}
              data-cy="schedule-stage-primary-action"
            >
              Lag planutkast
              <ArrowRight size={iconSizes.small} aria-hidden="true" />
            </SchedulingButton>
          ) : (
            <span className="text-detail tabular-nums text-text-subtle">
              {submittedCount} av {participantCount} har svart
            </span>
          )
        }
      />
    )}
  </div>
);

export default FoundationCoverageWorkspace;
