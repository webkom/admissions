import React from "react";
import { CalendarCheck, Info } from "lucide-react";
import { Chip, SchedulePanel } from "src/components/Scheduling/ui";
import { NameVisibility } from "../../types";
import { iconSizes } from "src/styles/designTokens";
import { ConflictImpact } from "./distributedPlanSelectors";

export const EmptyDistributedPlan: React.FC<{ isAdmin: boolean }> = ({
  isAdmin,
}) => (
  <SchedulePanel>
    <div className="px-6 py-14 text-center">
      <span className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand ring-1 ring-brand-ringSoft">
        <CalendarCheck size={iconSizes.standard} />
      </span>
      <h3 className="mb-1 mt-2 text-sm font-bold text-text-primary">
        Ingen plan publisert ennå
      </h3>
      <p className="m-0 mx-auto max-w-md text-ui leading-relaxed text-text-muted">
        {isAdmin
          ? 'Gå til "Intervjuforslag" for å generere et forslag.'
          : "Opptaksansvarlig har ikke publisert intervjuplanen ennå. Kom tilbake senere."}
      </p>
    </div>
  </SchedulePanel>
);

export const DistributedPlanNotices: React.FC<{
  myInterviewsOnly: boolean;
  myInterviewsCount: number;
  currentUserName: string;
  nameVisibility: NameVisibility;
  candidateNamesVisible: boolean;
  conflictImpacts: ConflictImpact[];
  formatTimeLabel: (time: number) => string;
}> = ({
  myInterviewsOnly,
  myInterviewsCount,
  currentUserName,
  nameVisibility,
  candidateNamesVisible,
  conflictImpacts,
  formatTimeLabel,
}) => (
  <>
    {myInterviewsOnly && myInterviewsCount === 0 && (
      <div className="border-b border-border-soft px-6 py-4 text-ui text-text-muted">
        Ingen intervjuer funnet for <strong>{currentUserName}</strong>. Filteret
        matcher på navn.
      </div>
    )}

    {nameVisibility === "committee" && (
      <div className="flex items-center gap-1.5 border-b border-border-soft px-6 py-2 text-detail text-text-faded">
        <Info
          size={iconSizes.detail}
          className="flex-none"
          aria-hidden="true"
        />
        <span>Klikk på et kandidatnavn for å markere inhabilitet</span>
      </div>
    )}

    {candidateNamesVisible && conflictImpacts.length > 0 && (
      <div className="border-b border-border-soft bg-surface-subtle px-6 py-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-detail font-medium text-text-muted">
            Inhabiliteter i publisert plan
          </span>
          <Chip tone="brand">{conflictImpacts.length}</Chip>
        </div>
        <div className="grid gap-2">
          {conflictImpacts.slice(0, 3).map((impact) => (
            <div
              key={`${impact.item.time}-${impact.scheduleIndex}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-border bg-brand-muted px-3 py-2 text-sm"
            >
              <span className="font-semibold text-text-primary">
                {formatTimeLabel(impact.item.time)} —{" "}
                {candidateNamesVisible ? impact.item.candidate : "Kandidat"}
              </span>
              <span className="text-text-muted">
                {impact.affectedPanel.length > 0
                  ? `${impact.affectedPanel.map((panel) => panel.name).join(", ")} må vurderes`
                  : "Du er i panelet og har markert inhabilitet"}
              </span>
            </div>
          ))}
          {conflictImpacts.length > 3 && (
            <span className="text-detail text-text-muted">
              + {conflictImpacts.length - 3} flere
            </span>
          )}
        </div>
      </div>
    )}
  </>
);
