import React from "react";
import ConfirmModal from "src/components/ConfirmModal";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import { useAdminDeleteApplicationMutation } from "src/query/mutations";
import { useParams } from "react-router-dom";
import { Button } from "@webkom/lego-bricks";

const DeleteWrapper = styled.div`
  display: flex;
  justify-content: center;

  ${media.handheld`
    margin: 0.3rem 0;
    padding: 0.5rem;
    justify-content: center;
    `};
`;

interface DeleteApplicationProps {
  applicationId: number;
  groupId?: number;
}

const DeleteApplication: React.FC<DeleteApplicationProps> = ({
  applicationId,
  groupId,
}) => {
  const { admissionSlug } = useParams();
  const deleteApplicationMutation = useAdminDeleteApplicationMutation(
    admissionSlug ?? "",
  );

  const performDelete = (applicationId: number, groupId?: number) => {
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
          <Button danger onClick={onClick} size="small">
            Slett søknad
          </Button>
        )}
        message="Er du sikker på at du vil slette denne søknaden?"
        onConfirm={() => performDelete(applicationId, groupId)}
      />
    </DeleteWrapper>
  );
};

export default DeleteApplication;
