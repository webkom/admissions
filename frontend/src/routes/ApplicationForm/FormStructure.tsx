import React, { ReactNode } from "react";
import { Form, Field, FormikValues } from "formik";
import FormatTime from "src/components/Time/FormatTime";
import Icon from "src/components/Icon";
import LegoButton from "src/components/LegoButton";
import PhoneNumberField from "./PhoneNumberField";
import ToggleGroups from "./ToggleGroups";
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
import { Admission, Group } from "src/types";

interface FormStructureProps extends FormikValues {
  admission: Admission;
  groups: Group[];
  selectedGroups: Record<string, string>;
  toggleGroup: (groupName: string) => void;
  SelectedGroupItems: ReactNode;
}

const FormStructure: React.FC<FormStructureProps> = ({
  admission,
  groups,
  selectedGroups,
  toggleGroup,
  hasSelected,
  SelectedGroupItems,
  handleSubmit,
  isSubmitting,
  isValid,
  onCancel,
}) => {
  const { data: myApplication } = useMyApplication(String(admission.slug));
  const isRevy = admission.slug === "revy";

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
              disabled={!isValid}
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
            Mobilnummeret vil bli brukt til å kalle deg inn på intervju.
          </HelpText>
          <Field name="phoneNumber" component={PhoneNumberField} />
        </GeneralInfoSection>
        <SeparatorLine />
        <GroupsSection>
          <Sidebar>
            <div>
              <SectionHeader>{isRevy ? "Grupper" : "Komiteer"}</SectionHeader>
              <HelpText>
                <Icon name="information-circle-outline" />
                {isRevy
                  ? "Her skriver du søknaden til gruppen(e) du har valgt."
                  : "Her skriver du søknaden til komiteen(e) du har valgt. Hver komité kan kun se søknaden til sin egen komité."}
              </HelpText>
              <HelpText>
                <Icon name="information-circle-outline" />
                Søknadene vil brukes i opptaksprosessen, men alle søkere vil bli
                kalt inn til intervju.
              </HelpText>

              <ToggleGroups
                groups={groups}
                selectedGroups={selectedGroups}
                toggleGroup={toggleGroup}
              />
            </div>
          </Sidebar>
          {hasSelected ? (
            <Applications>{SelectedGroupItems}</Applications>
          ) : (
            <NoChosenGroupsWrapper>
              <NoChosenTitle>
                Du har ikke valgt noen {isRevy ? "grupper" : "komiteer"}.
              </NoChosenTitle>
              <NoChosenSubTitle>
                Velg i sidemargen eller gå til {isRevy ? "gruppe" : "komite"}
                oversikten
              </NoChosenSubTitle>
              <LegoButton
                icon="arrow-forward"
                iconPrefix="ios"
                to={`/${admission.slug}/velg-komiteer`}
              >
                Velg {isRevy ? "grupper" : "komiteer"}
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
              {!isRevy && " av komiteen(e) du søker deg til"}.
            </SubmitInfo>
            <SubmitInfo>
              {isRevy
                ? "Søknaden din kan kun ses av revystyret."
                : "Din søknad til hver komité kan kun ses av den aktuelle komiteen og leder av Abakus."}{" "}
              All søknadsinformasjon slettes etter opptaket er gjennomført.
            </SubmitInfo>
            <SubmitInfo>Du kan når som helst trekke søknaden din.</SubmitInfo>
          </div>
          {hasSelected && (
            <div>
              <LegoButton
                icon="arrow-forward"
                iconPrefix="ios"
                onClick={handleSubmit}
                disabled={isSubmitting || !isValid}
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
