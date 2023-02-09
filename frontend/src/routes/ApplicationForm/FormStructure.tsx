import React, { ReactNode } from "react";
import { Form, Field, FormikValues } from "formik";
import FormatTime from "src/components/Time/FormatTime";
import Icon from "src/components/Icon";
import LegoButton from "src/components/LegoButton";
import PriorityTextField from "./PriorityTextField";
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
  InformationSection,
  InfoText,
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
  const { data: myApplication } = useMyApplication(String(admission.pk));
  const isSingleGroupAdmission = groups.length === 1;

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
        <InformationSection>
          <SectionHeader>Informasjon</SectionHeader>

          <InfoText>Hei!</InfoText>
          <InfoText>
            Aller først - tusen takk for din interesse for å søke backup! Lurer
            du på mer om oss kan du lese{" "}
            <a href="https://abakus.no/articles/447/"> her</a>. <br />
            Kriteriet for å søke er at du har interesse for Abakus og har vært
            medlem i Abakus i minst 3 måneder, men vi prioriterer 2. klassinger
            og oppover. Absolutt alle kan søke uavhengig om man har hatt
            tidligere verv eller ikke. Søkere som skal være i Trondheim hele det
            neste året vil få høyest prioritet, men om du kun er borte et halvt
            år vil din søknad likevel bli vurdert.
          </InfoText>

          <InfoText>
            Planen videre:
            <ul>
              <li> - 19. februar kl. 23:59: Søknadsfrist</li>
              <li> - 13.feb - 21. februar: Kaffeprat*</li>
              <li>
                - 22. feb: Du får svar på om du kommer med eller ikke. Kommer du
                ikke med i år anbefaler vi deg å søke til neste år igjen! Hold
                gjerne av ettermiddagen i tilfelle du blir tatt opp
              </li>
            </ul>
          </InfoText>
          <InfoText>
            *Dette er en lavterskelsamtale for at du skal bli bedre kjent med
            oss og vi bedre kjent med deg. Dersom du er på utveksling vil
            samtalene foregå over Zoom. Du vil bli kontaktet av to backupere for
            å finne tid som passer:)
          </InfoText>
          <InfoText>
            Vi håper du er motivert for å søke og ønsker deg lykke til i
            prosessen. Dersom du har noen spørsmål eller innspill til prosessen
            kan dette gjøres ved å sende en e-post til{" "}
            <a href="mailto:backup-rekruttering@abakus.no">
              backup-rekruttering@abakus.no
            </a>
            .
          </InfoText>
        </InformationSection>
        <SeparatorLine />
        <SeparatorLine />
        <GeneralInfoSection>
          <SectionHeader>Generelt</SectionHeader>
          <HelpText>
            <Icon name="information-circle-outline" />
            Mobilnummeret vil kunne brukes for å kontakte deg i forbindelse med
            opptaket
          </HelpText>
          <Field name="phoneNumber" component={PhoneNumberField} />

          <HelpText>
            <Icon name="information-circle-outline" />
            Alle i backup kan se det du skriver i søknaden din
          </HelpText>
          <Field
            name="priorityText"
            component={PriorityTextField}
            label="Hvilken klasse og linje går du, og skal du på utveksling neste år?"
          />
        </GeneralInfoSection>
        <SeparatorLine />
        <GroupsSection isSingleGroupAdmission={isSingleGroupAdmission}>
          {!isSingleGroupAdmission && (
            <Sidebar>
              <div>
                <SectionHeader>Komiteer</SectionHeader>
                <HelpText>
                  <Icon name="information-circle-outline" />
                  Her skriver du søknaden til backup
                </HelpText>

                <ToggleGroups
                  groups={groups}
                  selectedGroups={selectedGroups}
                  toggleGroup={toggleGroup}
                />
              </div>
            </Sidebar>
          )}
          {hasSelected || isSingleGroupAdmission ? (
            <Applications>{SelectedGroupItems}</Applications>
          ) : (
            <NoChosenGroupsWrapper>
              <NoChosenTitle>Du har ikke valgt noen komiteer.</NoChosenTitle>
              <NoChosenSubTitle>
                Velg i sidemargen eller gå til komiteoversikten
              </NoChosenSubTitle>
              <LegoButton
                icon="arrow-forward"
                iconPrefix="ios"
                to="../velg-komiteer"
              >
                Velg komiteer
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
              Oppdateringer etter søknadsfristen kan ikke garanteres å bli sett.
            </SubmitInfo>
            <SubmitInfo>
              Søkaden vil bli sett av hele backup. All søknadsinformasjon
              slettes etter opptaket er gjennomført. Ta kontakt med{" "}
              <a href="mailto:backup@abakus.no"> backup@abakus.no</a> eller{" "}
              <a href="mailto:backup-rekruttering@abakus.no">
                backup-rekruttering@abakus.no
              </a>{" "}
              om du har noen spørsmål.
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
