import React from "react";
import { LockKeyhole } from "lucide-react";
import { SchedulePanel } from "src/components/Scheduling/ui";
import { iconSizes } from "src/styles/designTokens";

interface MemberAvailabilityPendingProps {
  title?: string;
  description?: string;
}

const MemberAvailabilityPending: React.FC<MemberAvailabilityPendingProps> = ({
  title = "Venter på oppsett",
  description = "Registrering av tilgjengelighet er ikke åpnet ennå. Kom tilbake når opptaksansvarlig har åpnet registreringen.",
}) => (
  <SchedulePanel>
    <div className="px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center text-brand">
        <LockKeyhole size={iconSizes.hero} />
      </div>
      <h2 className="mb-2 text-xl font-semibold text-text-primary">{title}</h2>
      <p className="mx-auto max-w-md text-ui text-text-muted">{description}</p>
    </div>
  </SchedulePanel>
);

export default MemberAvailabilityPending;
