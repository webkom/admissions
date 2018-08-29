import React from "react";
import { Form, Field } from "formik";

import Title from "src/components/Title";
import PriorityTextField from "src/components/PriorityTextField";
import { CardTitle } from "src/components/Card";
import PhoneNumberField from "src/components/PhoneNumberField";

import {
  Wrapper,
  SubmitButton,
  ToggleCommitteeWrapper,
  NoChosenCommittees,
  NoChosenCommitteesSmallInfo,
  GeneralInfoWrapper
} from "./styles";

const FormStructure = ({
  hasSelected,
  SelectedComs,
  ChooseCommitteesItems,
  handleSubmit,
  isSubmitting,
  isValid
}) => (
  <div>
    <Wrapper>
      <Title handheld={"1.7rem"} margin={"1em 0 0 0"}>
        Søknad til komiteer
      </Title>

      <Form>
        <Title size={"3rem"} handheld={"1em"} color={"grey"}>
          Velg de komiteene du vil søke
        </Title>
        <ToggleCommitteeWrapper>{ChooseCommitteesItems}</ToggleCommitteeWrapper>

        {hasSelected ? (
          <div>
            <Title>Din søknad</Title>

            <GeneralInfoWrapper className="input" margin="0.5rem 0rem">
              <Field name="phoneNumber" component={PhoneNumberField} />

              <CardTitle margin="0.5rem" fontSize="0.8em">
                Her kan du rangere komiteer etter ønske, og komme med andre
                kommentarer.
              </CardTitle>
              <Field name="priorityText" component={PriorityTextField} />
            </GeneralInfoWrapper>

            {SelectedComs}
          </div>
        ) : (
          <div>
            <NoChosenCommittees>
              Du har ikke valgt noen komiteer.
            </NoChosenCommittees>
            <NoChosenCommitteesSmallInfo>
              Bruk lista på toppen for å velge komiteer
            </NoChosenCommitteesSmallInfo>
          </div>
        )}
      </Form>
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
