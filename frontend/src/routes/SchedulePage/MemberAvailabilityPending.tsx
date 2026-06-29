import React from "react";
import { LockKeyhole } from "lucide-react";
import { SchedulePanel } from "src/components/Scheduling/ui";

const MemberAvailabilityPending = () => (
  <SchedulePanel>
    <div className="px-6 py-20 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft text-brand ring-1 ring-brand-border/60">
        <LockKeyhole size={32} />
      </div>
      <h2 className="mb-2 text-2xl font-semibold text-text-primary">
        Venter på oppsett
      </h2>
      <p className="mx-auto max-w-[400px] text-lg leading-relaxed text-text-muted">
        Registrering av tilgjengelighet er ikke åpnet ennå. Kom tilbake når
        opptaksansvarlig har åpnet registreringen.
      </p>
    </div>
  </SchedulePanel>
);

export default MemberAvailabilityPending;
