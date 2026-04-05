import React from "react";
import { Form } from "formik";
import FormatTime from "src/components/Time/FormatTime";
import Icon from "src/components/Icon";
import ConfirmModal from "src/components/ConfirmModal";
import { useMyApplication } from "src/query/hooks";
import { useDeleteMyApplicationMutation } from "src/query/mutations";
import {
  ApplicationDateInfo,
  EditActions,
  EditInfo,
  FormHeader,
  GeneralInfoSection,
  GroupsSection,
  HelpText,
  InfoText,
  NoChosenGroupsWrapper,
  NoChosenSubTitle,
  NoChosenTitle,
  Notice,
  PageWrapper,
  SectionHeader,
  SeparatorLine,
  Sidebar,
  StyledSpan,
  TimeStamp,
  Title,
} from "src/routes/ApplicationForm/FormStructureStyle";
import { clearAllDrafts } from "src/utils/draftHelper";
import JsonFieldEditor from "src/components/JsonFieldEditor";
import LinkButton, { StyledButton } from "src/components/LinkButton";
import PriorityTextField from "../ApplicationForm/PriorityTextField";

interface FormStructureProps {
  toggleIsEditing: () => void;
}

const FormStructure: React.FC<FormStructureProps> = ({
  admission,
  groups,
  selectedGroups,
  toggleIsEditing,
  SelectedGroupItems,
  admissionSlug,
}) => {
  const { data: myApplication } = useMyApplication(admissionSlug);
  const deleteApplicationMutation =
    useDeleteMyApplicationMutation(admissionSlug);
  const isRevy = admissionSlug === "revy";
  const isRevyBoard = admissionSlug === "revystyret";
  const isBackup = admissionSlug === "backup";

  const { group_applications, updated_at } = myApplication || {};

  const hasSelected = group_applications && group_applications.length > 0;

  return (
    <PageWrapper>
      <FormHeader>
        <Title>
          Søknad {isRevy ? "mottatt" : isRevyBoard ? "mottatt" : "sendt"}!
        </Title>
        <TimeStamp>
          Sist oppdatert <FormatTime time={updated_at} />
        </TimeStamp>
      </FormHeader>
      <Form>
        <EditInfo>
          <Notice>
            {isRevy || isRevyBoard
              ? "Søknaden din er mottatt. Du kan endre eller slette den frem til søknadsfristen."
              : isBackup
                ? "Søknaden din er nå sendt til backup. Du kan endre eller slette den frem til søknadsfristen."
                : "Søknaden din er nå sendt til de aktuelle komiteene og leder av Abakus. Du kan endre eller slette den frem til søknadsfristen."}{" "}
            Gå til{" "}
            <a href="https://abakus.no" target="_blank" rel="noreferrer">
              abakus.no
            </a>{" "}
            for å se dine andre verv.
          </Notice>
        </EditInfo>
        <EditActions>
          {admission.is_open && (
            <StyledButton onClick={toggleIsEditing}>Endre søknad</StyledButton>
          )}
          <span />
          <ConfirmModal
            title="Slett søknad"
            trigger={({ onClick }) => (
              <StyledButton onClick={onClick} danger>
                {deleteApplicationMutation.isPending
                  ? "Sletter søknad..."
                  : deleteApplicationMutation.isError
                    ? "Klarte ikke slette søknad"
                    : deleteApplicationMutation.isSuccess
                      ? "Søknad slettet!"
                      : "Slett søknad"}
              </StyledButton>
            )}
            message="Er du sikker på at du vil slette søknaden din?"
            onConfirm={() =>
              deleteApplicationMutation.mutate(undefined, {
                onSuccess: () => {
                  clearAllDrafts();
                },
              })
            }
          />
        </EditActions>
        <SeparatorLine />
        {isBackup && (
          <>
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
                Spørsmål? Send mail til{" "}
                <a href="mailto:backup-rekruttering@abakus.no">
                  backup-rekruttering@abakus.no
                </a>
              </InfoText>
            </GeneralInfoSection>
            <SeparatorLine />
          </>
        )}
        <GeneralInfoSection $columnCount={isBackup ? 1 : 2}>
          <SectionHeader>Søknadstekst</SectionHeader>
          <JsonFieldEditor
            value={myApplication?.text_fields || {}}
            schema={admission?.public_text_fields || []}
            readOnly
          />

          {!isBackup && (
            <Sidebar>
              <HelpText>
                <Icon name="information-circle-outline" />
                <span>
                  Her kan du se teksten du har skrevet i de generelle feltene.
                  Denne teksten er lik for alle komiteene du søker.
                </span>
              </HelpText>
              {!isRevy && !isRevyBoard && (
                <HelpText>
                  <Icon name="information-circle-outline" />
                  <span>
                    Kun leder og nestleder av Abakus kan se det du skriver inn i
                    feltet for kommentar til leder av Abakus.
                  </span>
                </HelpText>
              )}
            </Sidebar>
          )}
        </GeneralInfoSection>
        <SeparatorLine />

        <GroupsSection>
          <SectionHeader>
            {isRevy ? "Grupper" : isRevyBoard ? "Stillinger" : "Komiteer"} du
            har søkt
          </SectionHeader>
          {hasSelected ? (
            <>
              {SelectedGroupItems}
              <Sidebar>
                <HelpText>
                  <Icon name="information-circle-outline" />
                  <span>
                    Her ser du{" "}
                    {isRevy
                      ? "gruppene"
                      : isRevyBoard
                        ? "stillingene"
                        : "komiteene"}{" "}
                    du har søkt på. Du kan prioritere dem ved å dra i dem.
                  </span>
                </HelpText>
                <HelpText>
                  <Icon name="information-circle-outline" />
                  <span>
                    Noen{" "}
                    {isRevy
                      ? "grupper"
                      : isRevyBoard
                        ? "stillinger"
                        : "komiteer"}{" "}
                    har egne spørsmål. Disse ser du under hver enkelt{" "}
                    {isRevy ? "gruppe" : isRevyBoard ? "stilling" : "komité"}.
                  </span>
                </HelpText>
                <PriorityTextField />
              </Sidebar>
            </>
          ) : (
            <NoChosenGroupsWrapper>
              <NoChosenTitle>
                Du har ikke søkt på noen{" "}
                {isRevy ? "grupper" : isRevyBoard ? "stillinger" : "komiteer"}
              </NoChosenTitle>
              <NoChosenSubTitle>
                Send inn en ny søknad for å velge{" "}
                {isRevy ? "grupper" : isRevyBoard ? "stillinger" : "komiteer"}.
              </NoChosenSubTitle>
              <LinkButton to={`/${admissionSlug}/velg-grupper`}>
                Velg{" "}
                {isRevy ? "grupper" : isRevyBoard ? "stillinger" : "komiteer"}
              </LinkButton>
            </NoChosenGroupsWrapper>
          )}
        </GroupsSection>
      </Form>
    </PageWrapper>
  );
};

export default FormStructure;
