import React from "react";
import { Form } from "formik";

import Button from "src/components/Button";
import PageTitle from "src/components/PageTitle";
import GridContainer from "./GridContainer";
import PageSubTitle from "./PageSubTitle";
import ChooseCommitteesContainerMobile from "./ChooseCommitteesContainerMobile";
import "./ApplicationForm.css";

const MobileApplicationForm = ({
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
        {hasSelected ? (
          selectedComs
        ) : (
          <h3 className="noChosen">Du har ikke valgt noen komiteer.</h3>
        )}
      </Form>
      <div className="committees-mobile">
        <PageSubTitle>Velg komiteer</PageSubTitle>
        <ChooseCommitteesContainerMobile>
          {chooseCommitteesItems}
        </ChooseCommitteesContainerMobile>
      </div>
    </GridContainer>
    {hasSelected && (
      <Button
        className="submit-btn"
        margin="0 auto 3em auto"
        onClick={handleSubmit}
        type="submit"
        disabled={isSubmitting}
        valid={isValid}
      >
        Submit
      </Button>
    )}
  </div>
);

export default MobileApplicationForm;
