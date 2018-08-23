import React from "react";
import { Form, Field } from "formik";

import PageTitle from "src/components/PageTitle";
import PriorityTextField from "src/components/PriorityTextField";

import {
  Wrapper,
  SubmitButton,
  PageSubTitle,
  ToggleCommitteeWrapper,
  ToggleCommitteeWrapperMobile,
  PhoneNumberField
} from "./styles";

const FormStructure = ({
  hasSelected,
  SelectedComs,
  ChooseCommitteesItems,
  handleSubmit,
  isSubmitting,
  isValid,
  isMobile
}) => (
  <div>
    <PageTitle>Søknad til komiteer</PageTitle>

    <Wrapper>
      <Form style={{ gridArea: "form" }}>
        <PageSubTitle>Dine søknader</PageSubTitle>
        <Field component={PriorityTextField} name="priorityText" />
        <PhoneNumberField
          type="tel"
          name="phoneNumber"
          onBlur={e => sessionStorage.setItem("phoneNumber", e.target.value)}
          placeholder="Fyll inn ditt mobilnummer"
        />

        {hasSelected ? SelectedComs : <h3>Du har ikke valgt noen komiteer.</h3>}
      </Form>

      <ToggleCommitteeWrapper>
        <PageSubTitle>Komiteer</PageSubTitle>
        {ChooseCommitteesItems}
      </ToggleCommitteeWrapper>
    </Wrapper>

    {hasSelected && (
      <SubmitButton
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

export default FormStructure;
