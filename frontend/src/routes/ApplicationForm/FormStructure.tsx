import React, { ReactNode } from "react";
import { Form, Field, FormikValues } from "formik";
import FormatTime from "src/components/Time/FormatTime";
import { Info } from "lucide-react";
import PhoneNumberField from "./PhoneNumberField";
import PriorityTextField from "./PriorityTextField";
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
import LinkButton, { StyledButton } from "src/components/LinkButton";

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
  const isRevyBoard = admission?.slug === "revystyret";
  const isBackup = admission?.slug === "backup";
  const isSingleGroupAdmission = admission?.groups.length === 1;

  return (
    <PageWrapper>
      <FormHeader>
        <Title>Skriv din søknad og send inn!</Title>
        {myApplication && (
          <CancelButtonContainer>
            {/* Never gated on validity: cancel discards nothing, and gating
                the escape hatch on the form being valid is what stranded
                applicants with no way back to their receipt. */}
            <StyledButton onClick={onCancel}>Avbryt</StyledButton>
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
            <Info aria-hidden="true" />
            Mobilnummeret vil bli brukt til å kalle deg inn på intervju.
          </HelpText>
          <Field name="phoneNumber" component={PhoneNumberField} />
          {!isSingleGroupAdmission && (
            <>
              <HelpText>
                <Info aria-hidden="true" />
                Ranger komiteene du har valgt med pilene under, og legg gjerne
                ved kommentarer til opptakets leder og nestleder.
              </HelpText>
              <PriorityTextField
                groups={groups}
                selectedGroups={selectedGroups}
              />
            </>
          )}
        </GeneralInfoSection>
        <SeparatorLine />
        <GroupsSection $isSingleGroupAdmission={isSingleGroupAdmission}>
          {!isSingleGroupAdmission && (
            <Sidebar>
              <div>
                <SectionHeader>
                  {isRevy ? "Grupper" : isRevyBoard ? "Stillinger" : "Komiteer"}
                </SectionHeader>
                <HelpText>
                  <Info aria-hidden="true" />
                  {isRevy
                    ? "Her skriver du søknaden til gruppen(e) du har valgt."
                    : isRevyBoard
                      ? "Her skriver du søknaden til stillingen(e) du har valgt."
                      : "Her skriver du søknaden til komiteen(e) du har valgt. Hver komité kan kun se søknaden til sin egen komité."}
                </HelpText>
                <HelpText>
                  <Info aria-hidden="true" />
                  Søknadene vil brukes i opptaksprosessen, men alle søkere vil
                  bli kalt inn til intervju.
                </HelpText>

                {!(isRevy || isRevyBoard) && (
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
                Du har ikke valgt noen{" "}
                {isRevy ? "grupper" : isRevyBoard ? "stillinger" : "komiteer"}.
              </NoChosenTitle>
              {!isRevyBoard && (
                <NoChosenSubTitle>
                  Velg i sidemargen eller gå til {isRevy ? "gruppe" : "komite"}
                  oversikten
                </NoChosenSubTitle>
              )}
              <LinkButton secondary to={`/${admission?.slug}/velg-grupper`}>
                Velg{" "}
                {isRevy ? "grupper" : isRevyBoard ? "stillinger" : "komiteer"}
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
              {!(isRevy || isRevyBoard) &&
                !isSingleGroupAdmission &&
                " av komiteen(e) du søker deg til"}
              .
            </SubmitInfo>
            <SubmitInfo>
              {isRevy || isRevyBoard
                ? "Søknaden din kan kun ses av revystyret."
                : isBackup
                  ? "Søknaden din kan kun ses av medlemmer av backup."
                  : "Søknaden kan ses av komiteene du søker, sentrale opptaksansvarlige som koordinerer intervjuer, og leder av Abakus."}{" "}
              Opplysningene skal bare brukes til å gjennomføre opptaket.
            </SubmitInfo>
            <SubmitInfo>
              Du kan når som helst trekke deg fra en komité du har søkt til —
              teksten slettes da permanent, og komiteen får beskjed anonymt.
              Søknadene dine til andre komiteer påvirkes ikke.
            </SubmitInfo>
          </div>
          {hasSelected && (
            <div>
              <StyledButton
                onClick={handleSubmit}
                disabled={isSubmitting || !isValid}
                success
              >
                Send inn søknad
              </StyledButton>
            </div>
          )}
        </SubmitSection>
        <ErrorFocus />
      </Form>
    </PageWrapper>
  );
};

export default FormStructure;
