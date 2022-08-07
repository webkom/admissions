import React from "react";
import LegoButton from "src/components/LegoButton";
import ConfirmModal from "src/components/ConfirmModal";
import callApi from "src/utils/callApi";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

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

const performDelete = (id, group) => {
  callApi(
    `/application/${id}/delete_group_application/${
      group ? `?group=${group}` : ""
    }`,
    {
      method: "DELETE",
    }
  )
    .then(() => location.reload())
    .catch((err) => {
      alert("Det skjedde en feil.... ");
      throw err;
    });
};

const DeleteApplication = ({ id, group }) => {
  return (
    <DeleteWrapper>
      <ConfirmModal
        title="Slett søknad"
        Component={({ onClick }) => (
          <LegoButton icon="trash" onClick={onClick}>
            Slett søknad
          </LegoButton>
        )}
        message="Er du sikker på at du vil slette denne søknaden?"
        onConfirm={() => performDelete(id, group)}
      />
    </DeleteWrapper>
  );
};

export default DeleteApplication;
