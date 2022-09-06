import React from "react";
import { Form, Field } from "formik";
import FormatTime from "src/components/Time/FormatTime";
import Icon from "src/components/Icon";
import LegoButton from "src/components/LegoButton";
import PriorityTextField from "./PriorityTextField";
import PhoneNumberField from "./PhoneNumberField";
import ErrorFocus from "./ErrorFocus";
import { useMyApplication } from "src/query/hooks";
import {
  ApplicationDateInfo,
  Applications,
  CancelButtonContainer,
  FormHeader,
  GeneralInfoSection,
  GroupsSection,
  HelpText,
  NoChosenGroupsWrapper,
  NoChosenSubTitle,
  NoChosenTitle,
  PageWrapper,
  SectionHeader,
  SeparatorLine,
  Sidebar,
  StyledSpan,
  SubmitInfo,
  SubmitSection,
  Title,
} from "./FormStructureStyle";

const FormStructure = ({
  admission,
  hasSelected,
  SelectedGroupItems,
  handleSubmit,
  isSubmitting,
  isValid,
  onCancel,
}) => {
  const { data: myApplication } = useMyApplication();

  return (
    <PageWrapper>
      <FormHeader>
        <Title>Skriv din søknad og send inn!</Title>
        {myApplication && (
          <CancelButtonContainer>
            <LegoButton
              icon="arrow-back"
              iconPrefix="ios"
              onClick={onCancel}
              valid={isValid}
              buttonStyle="primary"
            >
              Avbryt
            </LegoButton>
          </CancelButtonContainer>
        )}
      </FormHeader>
      <Form>
        <SeparatorLine />
        <GeneralInfoSection>
          <SectionHeader>Generelt</SectionHeader>
          <HelpText>
            <Icon name="information-circle-outline" />
            Mobilnummeret vil bli brukt til å kalle deg inn på intervju av
            revystyret.
          </HelpText>
          <Field name="phoneNumber" component={PhoneNumberField} />

          <HelpText>
            <Icon name="information-circle-outline" />
            Kun revystyret kan se det du skriver inn i prioriterings- og
            kommentarfeltet.
            <Icon name="information-circle-outline" />
            Det er ikke sikkert prioriteringslisten vil bli tatt hensyn til.
            Ikke søk på en gruppe du ikke ønsker å bli med i.
          </HelpText>
          <Field
            name="priorityText"
            component={PriorityTextField}
            label="Prioriteringer, og andre kommentarer"
            optional
          />
        </GeneralInfoSection>
        <SeparatorLine />
        <GroupsSection>
          <Sidebar>
            <div>
              <SectionHeader>Grupper</SectionHeader>
              <HelpText>
                <Icon name="information-circle-outline" />
                Her skriver du søknaden til gruppen(e) du har valgt.
              </HelpText>
            </div>
          </Sidebar>
          {hasSelected ? (
            <Applications>{SelectedGroupItems}</Applications>
          ) : (
            <NoChosenGroupsWrapper>
              <NoChosenTitle>Du har ikke valgt noen grupper.</NoChosenTitle>
              <NoChosenSubTitle>
                Velg i sidemargen eller gå til gruppeoversikten
              </NoChosenSubTitle>
              <LegoButton
                icon="arrow-forward"
                iconPrefix="ios"
                to="/velg-grupper"
              >
                Velg grupper
              </LegoButton>
            </NoChosenGroupsWrapper>
          )}
        </GroupsSection>
        <SeparatorLine />
        <SubmitSection>
          <div>
            {admission && (
              <div>
                <ApplicationDateInfo>
                  <StyledSpan bold>Søknadsfristen</StyledSpan> er{" "}
                  <StyledSpan bold red>
                    <FormatTime format="EEEE d. MMMM">
                      {admission.public_deadline}
                    </FormatTime>
                  </StyledSpan>
                  <StyledSpan red>
                    <FormatTime format=", kl. HH:mm:ss">
                      {admission.public_deadline}
                    </FormatTime>
                  </StyledSpan>
                  .
                </ApplicationDateInfo>
              </div>
            )}
            <SubmitInfo>
              Oppdateringer etter søknadsfristen kan ikke garanteres å bli sett
              av revystyret.
            </SubmitInfo>
            <SubmitInfo>
              Din søknad til hver gruppe kan kun ses av revystyret. All
              søknadsinformasjon slettes etter opptaket er gjennomført.
            </SubmitInfo>
            <SubmitInfo>Du kan når som helst trekke søknaden din.</SubmitInfo>
          </div>
          {hasSelected && (
            <div>
              <LegoButton
                icon="arrow-forward"
                iconPrefix="ios"
                onClick={handleSubmit}
                type="submit"
                disabled={isSubmitting}
                valid={isValid}
                buttonStyle="tertiary"
              >
                Send inn søknad
              </LegoButton>
            </div>
          )}
        </SubmitSection>
        <ErrorFocus />
      </Form>
    </PageWrapper>
  );
};

export default FormStructure;
