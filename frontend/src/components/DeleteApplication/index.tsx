import React from "react";
import ConfirmModal from "src/components/ConfirmModal";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import { useAdminDeleteApplicationMutation } from "src/query/mutations";
import { useParams } from "react-router-dom";
import { StyledButton } from "src/components/LinkButton";

const DeleteWrapper = styled.div`
  display: flex;
  justify-content: center;

  ${media.handheld`
    margin: 0.3rem 0;
    padding: var(--spacing-sm);
    justify-content: center;
    `};
`;

interface DeleteApplicationProps {
  applicationId: string;
  groupId?: string;
}

const DeleteApplication: React.FC<DeleteApplicationProps> = ({
  applicationId,
  groupId,
}) => {
  const { admissionSlug } = useParams();
  const deleteApplicationMutation = useAdminDeleteApplicationMutation(
    admissionSlug ?? "",
  );

  const performDelete = (applicationId: string, groupId?: string) => {
    deleteApplicationMutation.mutate(
      { applicationId, groupId },
      {
        onError: (error) => {
          alert("Det skjedde en feil.... ");
          throw error;
        },
      },
    );
  };

  return (
    <DeleteWrapper>
      <ConfirmModal
        title="Slett søknad"
        trigger={({ onClick }) => (
          <StyledButton danger onClick={onClick} size="small">
            Slett søknad
          </StyledButton>
        )}
        message="Er du sikker på at du vil slette denne søknaden?"
        onConfirm={() => performDelete(applicationId, groupId)}
      />
    </DeleteWrapper>
  );
};

export default DeleteApplication;
