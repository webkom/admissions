import React from "react";
import ConfirmModal from "src/components/ConfirmModal";
import styled from "styled-components";
import { useAdminDeleteApplicationMutation } from "src/query/mutations";
import { useParams } from "react-router-dom";
import { StyledButton } from "src/components/LinkButton";
import { getApiErrorMessage } from "src/utils/apiErrors";
import { Trash2 } from "lucide-react";
import { iconSizes } from "src/styles/designTokens";
import { isSensitiveAuthorityChangedError } from "src/query/sensitiveAccess";

const DeleteWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  align-items: stretch;
  min-width: 0;
`;

interface DeleteApplicationProps {
  applicationId: string;
  groupId: string;
  candidateName: string;
  groupName: string;
  menuItem?: boolean;
}

const DeleteApplication: React.FC<DeleteApplicationProps> = ({
  applicationId,
  groupId,
  candidateName,
  groupName,
  menuItem = false,
}) => {
  const { admissionSlug } = useParams();
  const [errorMessage, setErrorMessage] = React.useState("");
  const deleteApplicationMutation = useAdminDeleteApplicationMutation(
    admissionSlug ?? "",
  );
  const deleteLabel = `Slett søknad til ${groupName}`;

  const performDelete = (applicationId: string, groupId: string) => {
    setErrorMessage("");
    deleteApplicationMutation.mutate(
      { applicationId, groupId },
      {
        onError: (error) => {
          if (isSensitiveAuthorityChangedError(error)) return;
          setErrorMessage(
            getApiErrorMessage(
              error,
              `Kunne ikke slette søknaden til ${groupName}. Prøv igjen.`,
            ),
          );
        },
      },
    );
  };

  return (
    <DeleteWrapper>
      <ConfirmModal
        title={deleteLabel}
        confirmText="Slett søknad"
        trigger={({ onClick }) => (
          <>
            {menuItem ? (
              <MenuItemButton
                type="button"
                role="menuitem"
                onClick={onClick}
                disabled={deleteApplicationMutation.isPending}
              >
                <Trash2 size={iconSizes.control} aria-hidden="true" />
                {deleteLabel}
              </MenuItemButton>
            ) : (
              <StyledButton
                type="button"
                danger
                onClick={onClick}
                size="small"
                disabled={deleteApplicationMutation.isPending}
              >
                {deleteLabel}
              </StyledButton>
            )}
          </>
        )}
        message={`Er du sikker på at du vil slette søknaden fra ${candidateName} til ${groupName}? Andre gruppesøknader fra kandidaten blir ikke slettet.`}
        onConfirm={() => performDelete(applicationId, groupId)}
      />
      {errorMessage && (
        <span role="alert" className="max-w-xs text-detail text-danger">
          {errorMessage}
        </span>
      )}
    </DeleteWrapper>
  );
};

export default DeleteApplication;

const MenuItemButton = styled.button`
  display: flex;
  width: 100%;
  min-height: var(--control-height-sm);
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border: 0;
  border-radius: var(--border-radius-sm);
  background: transparent;
  color: var(--color-danger);
  cursor: pointer;
  font: inherit;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-align: left;

  &:hover {
    background: var(--color-danger-bg);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-brand-ring-soft);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: var(--opacity-disabled);
  }
`;
