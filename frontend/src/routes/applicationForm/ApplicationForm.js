import React from "react";
import { Form } from "formik";

import PageTitle from "src/components/PageTitle";
import GridContainer from "./GridContainer";
import SubmitButton from "./SubmitButton";
import PageSubTitle from "./PageSubTitle";
import ChooseCommitteesContainer from "./ChooseCommitteesContainer";
import "./ApplicationForm.css";

const ApplicationForm = ({
  hasSelected,
  selectedComs,
  chooseCommitteesItems,
  handleSubmit,
  isSubmitting,
  isValid
}) => (
  <div>
    <PageTitle>Søknad til komiteer</PageTitle>

    <GridContainer>
      <Form className="form">
        <PageSubTitle>Dine søknader</PageSubTitle>
        {hasSelected ? selectedComs : <h3>Du har ikke valgt noen komiteer.</h3>}
      </Form>
      <ChooseCommitteesContainer>
        <PageSubTitle>Komiteer</PageSubTitle>
        {chooseCommitteesItems}
      </ChooseCommitteesContainer>
    </GridContainer>
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
);

export default ApplicationForm;
