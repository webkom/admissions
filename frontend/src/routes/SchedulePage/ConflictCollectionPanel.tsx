import React from "react";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";

import {
  SchedulePanel,
  SchedulePanelBody,
  SchedulePanelFooter,
  SchedulePanelHeader,
  SchedulingButton,
} from "src/components/Scheduling/ui";
import { iconSizes } from "src/styles/designTokens";

interface ConflictCollectionPanelProps {
  open: boolean;
  participantCount: number;
  completedCount: number;
  candidateCount: number;
  saving: boolean;
  stale?: boolean;
  onToggle: (open: boolean) => void;
  children?: React.ReactNode;
}

const ConflictCollectionPanel: React.FC<ConflictCollectionPanelProps> = ({
  open,
  participantCount,
  completedCount,
  candidateCount,
  saving,
  stale = false,
  onToggle,
  children,
}) => {
  const canClose =
    stale || (participantCount > 0 && completedCount >= participantCount);

  return (
    <div className="flex flex-col gap-3" data-cy="conflict-collection">
      <SchedulePanel>
        <SchedulePanelHeader
          icon={ShieldAlert}
          title="Inhabilitet"
          description={
            stale
              ? "Kandidat- eller intervjuerlisten er endret. Lukk den utdaterte kontrollen og åpne navnene på nytt."
              : open
                ? "Kandidatnavn er midlertidig synlige for deltakende intervjuere. Hver intervjuer kontrollerer hele kandidatlisten før planutkastet lages."
                : "Åpne kandidatnavn midlertidig slik at intervjuere kan registrere hvem de er inhabile for før planleggingen."
          }
        />
        <SchedulePanelBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="m-0 text-ui font-semibold text-text-primary">
              {open
                ? stale
                  ? "Kontrollen må startes på nytt"
                  : `${completedCount} av ${participantCount} intervjuere har kontrollert kandidatene`
                : `${candidateCount} kandidater klare for kontroll`}
            </p>
            <p className="m-0 mt-1 text-detail text-text-muted">
              Søknadstekster, komitévalg og kontaktinformasjon deles ikke.
            </p>
          </div>
          <SchedulingButton
            variant={open ? "quiet" : "primary"}
            disabled={saving || (open && !canClose)}
            onClick={() => onToggle(!open)}
            data-cy="toggle-conflict-collection"
          >
            {open ? (
              <EyeOff size={iconSizes.small} aria-hidden="true" />
            ) : (
              <Eye size={iconSizes.small} aria-hidden="true" />
            )}
            {saving
              ? "Lagrer…"
              : open
                ? stale
                  ? "Lukk utdaterte navn"
                  : "Fullfør og lukk navn"
                : "Åpne kandidatnavn"}
          </SchedulingButton>
        </SchedulePanelBody>
        {open && !canClose && (
          <SchedulePanelFooter>
            <span className="text-detail text-text-muted">
              Knappen blir tilgjengelig når alle deltakende intervjuere har
              kontrollert listen.
            </span>
          </SchedulePanelFooter>
        )}
      </SchedulePanel>
      {open && children}
    </div>
  );
};

export default ConflictCollectionPanel;
