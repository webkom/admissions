import React, { ReactNode } from "react";
import { Form, Field, FormikValues } from "formik";
import FormatTime from "src/components/Time/FormatTime";
import Icon from "src/components/Icon";
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
import { SelectedGroups } from ".";
import JsonFieldEditor from "src/components/JsonFieldEditor";
import { Button } from "@webkom/lego-bricks";
import LinkButton from "src/components/LinkButton";
import PriorityTextField from "./PriorityTextField";

interface FormStructureProps extends FormikValues {
  admission?: Admission;
  groups: Group[];
  selectedGroups: SelectedGroups;
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
  const { data: myApplication } = useMyApplication(String(admission?.slug));
  const isRevy = admission?.slug === "revy";
  const isBackup = admission?.slug === "backup";
  const isSingleGroupAdmission = admission?.groups.length === 1;

  return (
    <PageWrapper>
      <FormHeader>
        <Title>Skriv din søknad og send inn!</Title>
        {myApplication && (
          <CancelButtonContainer>
            <Button onClick={onCancel} disabled={!isValid}>
              Avbryt
            </Button>
          </CancelButtonContainer>
        )}
      </FormHeader>
      <Form>
        {isBackup && (
          <>
            <SeparatorLine />
            <GeneralInfoSection $columnCount={1}>
              <SectionHeader>Informasjon</SectionHeader>
              <InfoText>
                Aller først - tusen takk for din interesse for å søke backup!
                Lurer du på mer om oss kan du lese{" "}
                <a
                  href="https://abakus.no/articles/553-backup-har-opptak"
                  target="_blank"
                  rel="noreferrer"
                >
                  denne artikkelen på abakus.no
                </a>
                .
              </InfoText>
              <InfoText>
                Kriteriet for å søke er at du har interesse for Abakus og har
                vært medlem i Abakus i minst 3 måneder. Absolutt alle kan søke
                uavhengig om man har hatt tidligere verv eller ikke. For å søke
                må du være i Trondheim det påfølgende høstsemesteret. Søkere som
                blir værende hele det neste året vil bli prioritert, men
                søknader fra de som kun er borte et halvt år vil likevel bli
                vurdert.
              </InfoText>
              <InfoText>
                Planen videre:
                <ul>
                  <li>05. mars kl. 23:59: Søknadsfrist</li>
                  <li>27. februar - 07. mars: Kaffeprat*</li>
                  <li>
                    10/11. mars: Du får svar på om du kommer med eller ikke.{" "}
                    <br />
                    Kommer du ikke med i år anbefaler vi deg å søke til neste år
                    igjen! Hold gjerne av ettermiddagen 12. mars i tilfelle du
                    blir tatt opp.
                  </li>
                </ul>
              </InfoText>
              <InfoText>
                *Dette er en lavterskelsamtale for at du skal bli bedre kjent
                med oss og vi blir bedre kjent med deg. Dersom du er på
                utveksling vil samtalene foregå over Zoom. Du vil bli kontaktet
                av to backupere for å finne tid som passer:)
              </InfoText>
              <InfoText>
                Vi håper du er motivert for å søke og ønsker deg lykke til i
                prosessen. Dersom du har noen spørsmål eller innspill til
                prosessen kan dette gjøres ved å sende en e-post til{" "}
                <a href="mailto:backup-rekruttering@abakus.no">
                  backup-rekruttering@abakus.no
                </a>
                .
              </InfoText>
            </GeneralInfoSection>
          </>
        )}
        <SeparatorLine />
        <GeneralInfoSection>
          <SectionHeader>Generelt</SectionHeader>
          <HelpText>
            <Icon name="information-circle-outline" />
            Mobilnummeret vil bli brukt til å kalle deg inn på intervju.
          </HelpText>
          <Field name="phoneNumber" component={PhoneNumberField} />
          {!isSingleGroupAdmission && (
            <>
              <HelpText>
                {!isRevy && (
                  <>
                    <Icon name="information-circle-outline" />
                    Kun leder og nestleder av Abakus kan se det du skriver inn i
                    prioriterings- og kommentarfeltet.
                  </>
                )}
                <Icon name="information-circle-outline" />
                Prioriteringslisten vil bli tatt hensyn til så langt det lar seg
                gjøre, men garanterer ingenting. Ikke søk på en{" "}
                {isRevy ? "gruppe" : "komité"} du ikke ønsker å bli med i.
              </HelpText>
              <Field
                name="priorityText"
                component={PriorityTextField}
                label="Prioriteringer, og andre kommentarer"
                optional
              />
            </>
          )}
          <JsonFieldEditor
            sectionName="headerFields"
            fields={admission?.header_fields}
          />
        </GeneralInfoSection>
        <SeparatorLine />
        <GroupsSection $isSingleGroupAdmission={isSingleGroupAdmission}>
          {!isSingleGroupAdmission && (
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
                  Søknadene vil brukes i opptaksprosessen, men alle søkere vil
                  bli kalt inn til intervju.
                </HelpText>

                {!isRevy && (
                  <ToggleGroups
                    groups={groups}
                    selectedGroups={selectedGroups}
                    toggleGroup={toggleGroup}
                  />
                )}
              </div>
            </Sidebar>
          )}
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
              <LinkButton secondary to={`/${admission?.slug}/velg-grupper`}>
                Velg {isRevy ? "grupper" : "komiteer"}
              </LinkButton>
            </NoChosenGroupsWrapper>
          )}
        </GroupsSection>
        <SeparatorLine />
        <SubmitSection>
          <div>
            {admission && (
              <div>
                <ApplicationDateInfo>
                  <StyledSpan $bold>Søknadsfristen</StyledSpan> er{" "}
                  <StyledSpan $bold $red>
                    <FormatTime format="EEEE d. MMMM">
                      {admission.public_deadline}
                    </FormatTime>
                  </StyledSpan>
                  <StyledSpan $red>
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
              {!isRevy &&
                !isSingleGroupAdmission &&
                " av komiteen(e) du søker deg til"}
              .
            </SubmitInfo>
            <SubmitInfo>
              {isRevy
                ? "Søknaden din kan kun ses av revystyret."
                : isBackup
                  ? "Søknaden din kan kun ses av medlemmer av backup."
                  : "Din søknad til hver komité kan kun ses av den aktuelle komiteen og leder av Abakus."}{" "}
              All søknadsinformasjon slettes etter opptaket er gjennomført.
            </SubmitInfo>
            <SubmitInfo>Du kan når som helst trekke søknaden din.</SubmitInfo>
          </div>
          {hasSelected && (
            <div>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !isValid}
                success
              >
                Send inn søknad
              </Button>
            </div>
          )}
        </SubmitSection>
        <ErrorFocus />
      </Form>
    </PageWrapper>
  );
};

export default FormStructure;
