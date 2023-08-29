import React from "react";
import LegoButton from "src/components/LegoButton";
import ConfirmModal from "src/components/ConfirmModal";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import { useDeleteGroupApplicationMutation } from "src/query/mutations";
import { useParams } from "react-router-dom";

const DeleteWrapper = styled.div`
  display: flex;
  justify-content: center;
  margin: 0.8rem 0;
  padding: 0.5rem;

  ${media.handheld`
    margin: 0.3rem 0;
    padding: 0.5rem;
    justify-content: center;
    `};
`;

interface DeleteApplicationProps {
  applicationId: number;
  groupName?: string;
}

const DeleteApplication: React.FC<DeleteApplicationProps> = ({
  applicationId,
  groupName,
}) => {
  const { admissionSlug } = useParams();
  const deleteGroupApplicationMutation = useDeleteGroupApplicationMutation(
    admissionSlug ?? ""
  );

  const performDelete = (applicationId: number, groupName?: string) => {
    deleteGroupApplicationMutation.mutate(
      { applicationId, groupName },
      {
        onError: (error) => {
          alert("Det skjedde en feil.... ");
          throw error;
        },
      }
    );
  };

  return (
    <DeleteWrapper>
      <ConfirmModal
        title="Slett søknad"
        Component={({ onClick }) => (
          <LegoButton icon="trash" onClick={onClick} size="small">
            Slett søknad
          </LegoButton>
        )}
        message="Er du sikker på at du vil slette denne søknaden?"
        onConfirm={() => performDelete(applicationId, groupName)}
      />
    </DeleteWrapper>
  );
};

export default DeleteApplication;
