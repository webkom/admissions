import React from "react";
import { Form, Field } from "formik";

import PageTitle from "src/components/PageTitle";
import PriorityTextField from "src/components/PriorityTextField";
import { Card, CardTitle } from "src/components/Card";
import PhoneNumberField from "src/components/PhoneNumberField";

import {
  Wrapper,
  SubmitButton,
  ToggleCommitteeWrapper,
  ToggleCommitteeWrapperMobile,
  NoChosenCommittees,
  NoChosenCommitteesSmallInfo,
  SubTitle
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
    <Wrapper>
      <PageTitle>Søknad til komiteer</PageTitle>

      <Form>
        <ToggleCommitteeWrapper>{ChooseCommitteesItems}</ToggleCommitteeWrapper>

        {hasSelected ? (
          <div>
            <SubTitle>Din søknad</SubTitle>

            <Card className="input" margin="0.5rem 0rem">
              <Field name="phoneNumber" component={PhoneNumberField} />

              <CardTitle margin="0.5rem" fontSize="0.8em">
                Her kan du rangere komiteer etter ønske, og komme med andre
                kommentarer.
              </CardTitle>
              <Field name="priorityText" component={PriorityTextField} />
            </Card>

            {SelectedComs}
          </div>
        ) : (
          <div>
            <NoChosenCommittees>
              Du har ikke valgt noen komiteer.
            </NoChosenCommittees>
            <NoChosenCommitteesSmallInfo>
              Gå tilbake til komitéoversikten eller velg over for å søke.
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
