import React from "react";
import LegoButton from "src/components/LegoButton";
import ConfirmModal from "src/components/ConfirmModal";
import callApi from "src/utils/callApi";

const performDelete = (id, committee) => {
  callApi(
    `/application/${id}/delete_committee_application/${
      committee ? `?committee=${committee}` : ""
    }`,
    {
      method: "DELETE"
    }
  )
    .then(() => location.reload())
    .catch(err => {
      alert("Det skjedde en feil.... ");
      throw err;
    });
};

const DeleteApplication = ({ id, committee }) => {
  return (
    <ConfirmModal
      title="Slett søknad"
      Component={({ onClick }) => (
        <LegoButton icon="trash" onClick={onClick}>
          Slett søknad
        </LegoButton>
      )}
      message="Er du sikker på at du vil slette denne søknaden?"
      onConfirm={() => performDelete(id, committee)}
    />
  );
};

export default DeleteApplication;
