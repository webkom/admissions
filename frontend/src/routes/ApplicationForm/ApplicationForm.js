import React from "react";
import { Form, Field } from "formik";

import PageTitle from "src/components/PageTitle";
import PriorityTextField from "src/components/PriorityTextField";

import ChooseCommitteesContainer from "./ChooseCommitteesContainer";
import GridContainer from "./GridContainer";
import SubmitButton from "./SubmitButton";
import PageSubTitle from "./PageSubTitle";
import CSRFToken from "./csrftoken";
import callApi from "src/utils/callApi";

import "./ApplicationForm.css";

const ApplicationForm = ({
  hasSelected,
  SelectedComs,
  ChooseCommitteesItems,
  handleSubmit,
  isSubmitting,
  isValid
}) => {
  return (
    <div>
      <PageTitle>Søknad til komiteer</PageTitle>

      <GridContainer>
        <Form className="form">
          <CSRFToken />
          <PageSubTitle>Dine søknader</PageSubTitle>
          <Field component={PriorityTextField} name="priorityText" />
          <Field
            type="tel"
            name="phoneNumber"
            onBlur={e => sessionStorage.setItem("phoneNumber", e.target.value)}
            placeholder="Fyll inn ditt mobilnummer"
          />

          {hasSelected ? SelectedComs : <h3>Du har ikke valgt noen komiteer.</h3>}
        </Form>
        <ChooseCommitteesContainer>
          <PageSubTitle>Komiteer</PageSubTitle>
          {ChooseCommitteesItems}
        </ChooseCommitteesContainer>
        <div className="buttons-container">
          <SubmitButton
            className="delete-btn"
            onClick={() => callApi("/application/", {
              method: "DELETE"
            }).then(
              () => {
                window.location = "/";
              }
            )}
            margin="0 auto 3em auto"
          >
          Slett søknad
          </SubmitButton>
          {hasSelected && (
            <SubmitButton
              className="submit-btn"
              margin="0 auto 3em auto"
              onClick={handleSubmit}
              type="submit"
              disabled={isSubmitting}
              valid={isValid}
            >
              Submit
            </SubmitButton>
          )}
        </div>
      </GridContainer>
    </div>
  );
}

export default ApplicationForm;
