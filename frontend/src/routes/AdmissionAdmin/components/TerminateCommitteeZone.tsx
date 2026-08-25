import React, { useState } from "react";

import ConfirmDialog from "src/components/Scheduling/ConfirmDialog";
import { useTerminateCommitteeMutation } from "src/query/mutations";
import { isSensitiveAuthorityChangedError } from "src/query/sensitiveAccess";
import cn from "src/utils/cn";
import { getApiErrorMessage } from "src/utils/apiErrors";
import {
  actionButtonBase,
  actionButtonDanger,
} from "src/components/Scheduling/ui";
import type { Group } from "src/types";

import {
  DangerZone,
  DangerZoneContent,
  DialogTerminationError,
  TerminateText,
  TerminationError,
  TerminationInput,
  TerminationScopeHint,
  TerminationStatus,
  TerminateCommitteePanel,
} from "./TerminateCommitteeZone.styles";

interface TerminateCommitteeZoneProps {
  admissionSlug: string;
  terminationGroup: Group | undefined;
  isAdmin: boolean;
  isCommitteeMinimal: boolean;
}

/**
 * Feature-specific danger zone for permanently deleting committee application
 * data. Kept as its own component deliberately: it has exactly one
 * call-site today, so we are not generalising it into a reusable danger zone
 * primitive.
 *
 * Behaviour mirrors the original inline flow:
 *  - dialog requires the committee name to be typed exactly,
 *  - mutation succeeds → closes dialog and renders a success status,
 *  - mutation fails (except for a sensitive-authority change) → surfaces the
 *    error inside both the zone and the dialog.
 */
const TerminateCommitteeZone: React.FC<TerminateCommitteeZoneProps> = ({
  admissionSlug,
  terminationGroup,
  isAdmin,
  isCommitteeMinimal,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();

  const terminateCommittee = useTerminateCommitteeMutation(admissionSlug);

  if (!isAdmin || isCommitteeMinimal) return null;

  const matchesGroup =
    terminationGroup !== undefined &&
    confirmName.toLowerCase() === terminationGroup.name.toLowerCase();

  const canEdit = !terminateCommittee.isPending;

  const closeDialog = () => {
    if (!canEdit) return;
    setIsOpen(false);
    setConfirmName("");
  };

  const openDialog = () => {
    setError(undefined);
    setSuccess(undefined);
    setIsOpen(true);
  };

  const handleConfirm = () => {
    if (!terminationGroup || !matchesGroup) return;
    setError(undefined);
    terminateCommittee.mutate(
      {
        groupId: terminationGroup.pk,
        confirmationName: confirmName,
      },
      {
        onSuccess: () => {
          setIsOpen(false);
          setConfirmName("");
          setSuccess(
            `Søknadsdata for ${terminationGroup.name} er slettet permanent.`,
          );
        },
        onError: (err) => {
          if (isSensitiveAuthorityChangedError(err)) return;
          setError(
            getApiErrorMessage(
              err,
              "Kunne ikke slette komitédata. Prøv igjen.",
            ),
          );
        },
      },
    );
  };

  return (
    <>
      <DangerZone>
        <summary>Faresone</summary>
        <DangerZoneContent>
          {!terminationGroup && (
            <TerminationScopeHint>
              Velg nøyaktig én komité i gruppefilteret før du kan terminere den.
            </TerminationScopeHint>
          )}
          {terminationGroup && (
            <TerminateCommitteePanel aria-labelledby="terminate-committee-title">
              <TerminateText>
                <h2 id="terminate-committee-title">Slett alle søknader</h2>
                <p>
                  Sletter alle søknader til {terminationGroup.name} i dette
                  opptaket permanent. Kan ikke angres.
                </p>
              </TerminateText>
              <button
                type="button"
                className={cn(actionButtonBase, actionButtonDanger)}
                onClick={openDialog}
              >
                Terminer komité
              </button>
            </TerminateCommitteePanel>
          )}
          {success && (
            <TerminationStatus role="status">{success}</TerminationStatus>
          )}
          {error && <TerminationError role="alert">{error}</TerminationError>}
        </DangerZoneContent>
      </DangerZone>
      {isOpen && terminationGroup && (
        <ConfirmDialog
          title={`Terminer ${terminationGroup.name}?`}
          confirmLabel="Slett permanent"
          onClose={closeDialog}
          onConfirm={handleConfirm}
          confirmDisabled={!matchesGroup}
          busy={terminateCommittee.isPending}
          tone="danger"
        >
          <p>
            Dette kan ikke angres. Skriv{" "}
            <strong>{terminationGroup.name}</strong> for å bekrefte at alle
            søknadsdata for denne komiteen skal slettes.
          </p>
          <p>
            Søkere som bare har søkt denne komiteen fjernes også fra en
            eksisterende intervjuplan, og aktive kjøringer av
            planleggingsverktøyet stoppes.
          </p>
          {error && (
            <DialogTerminationError role="alert">
              {error}
            </DialogTerminationError>
          )}
          <label htmlFor="terminate-committee-confirmation">Komiténavn</label>
          <TerminationInput
            id="terminate-committee-confirmation"
            value={confirmName}
            onChange={(event) =>
              setConfirmName(event.target.value.toLowerCase())
            }
            autoComplete="off"
            spellCheck={false}
          />
        </ConfirmDialog>
      )}
    </>
  );
};

export default TerminateCommitteeZone;
