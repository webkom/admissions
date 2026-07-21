import React from "react";
import { Form } from "formik";
import FormatTime from "src/components/Time/FormatTime";
import { Info } from "lucide-react";
import ConfirmModal from "src/components/ConfirmModal";
import { useAdmission, useMyApplication } from "src/query/hooks";
import { useDeleteMyApplicationMutation } from "src/query/mutations";
import {
  EditActions,
  EditInfo,
  FormHeader,
  GeneralInfoSection,
  GroupsSection,
  InfoText,
  NoChosenGroupsWrapper,
  NoChosenSubTitle,
  NoChosenTitle,
  Notice,
  PageWrapper,
  SectionHeader,
  SeparatorLine,
  TimeStamp,
  Title,
} from "src/routes/ApplicationForm/FormStructureStyle";
import { clearAllDrafts } from "src/utils/draftHelper";
import type { InputFieldModel } from "src/utils/jsonFields";
import LinkButton, { StyledButton } from "src/components/LinkButton";
import { useParams } from "react-router-dom";
import styled from "styled-components";

interface FormStructureProps {
  toggleIsEditing: () => void;
}

const formatResponse = (value: unknown): string => {
  if (typeof value === "boolean") return value ? "Ja" : "Nei";
  return typeof value === "string" && value.trim() ? value : "Ikke besvart";
};

const FormStructure: React.FC<FormStructureProps> = ({ toggleIsEditing }) => {
  const { admissionSlug = "" } = useParams();
  const { data: admission, isLoading: admissionIsLoading } =
    useAdmission(admissionSlug);
  const { data: myApplication, isLoading: applicationIsLoading } =
    useMyApplication(admissionSlug);
  const deleteApplicationMutation =
    useDeleteMyApplicationMutation(admissionSlug);
  const isRevy = admissionSlug === "revy";
  const isRevyBoard = admissionSlug === "revystyret";
  const isBackup = admissionSlug === "backup";

  const { group_applications, updated_at } = myApplication || {};

  const hasSelected = group_applications && group_applications.length > 0;

  if (admissionIsLoading || applicationIsLoading) {
    return <p>Loading</p>;
  }

  if (!admission || !myApplication) {
    return <p>Feil: klarte ikke hente søknaden din.</p>;
  }

  return (
    <PageWrapper>
      <FormHeader>
        <Title>
          Søknad {isRevy ? "mottatt" : isRevyBoard ? "mottatt" : "sendt"}!
        </Title>
        <TimeStamp>
          Sist oppdatert{" "}
          {updated_at && (
            <FormatTime format="EEEE d. MMMM, kl. HH:mm">
              {updated_at}
            </FormatTime>
          )}
        </TimeStamp>
      </FormHeader>
      <Form>
        <EditInfo>
          <Notice>
            {isRevy || isRevyBoard
              ? "Søknaden din er mottatt. Du kan endre eller slette den frem til søknadsfristen."
              : isBackup
                ? "Søknaden din er nå sendt til backup. Du kan endre eller slette den frem til søknadsfristen."
                : "Søknaden din er nå sendt til de aktuelle komiteene, sentrale opptaksansvarlige som koordinerer intervjuer, og leder av Abakus. Du kan endre eller slette den frem til søknadsfristen."}{" "}
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
          <SectionHeader>Generelt</SectionHeader>
          <ReceiptFields>
            <ReceiptField>
              <ReceiptLabel>Mobilnummer</ReceiptLabel>
              <ReceiptValue>
                {myApplication.phone_number || "Ikke oppgitt"}
              </ReceiptValue>
            </ReceiptField>
          </ReceiptFields>
        </GeneralInfoSection>
        <SeparatorLine />

        <GroupsSection>
          <SectionHeader>
            {isRevy ? "Grupper" : isRevyBoard ? "Stillinger" : "Komiteer"} du
            har søkt
          </SectionHeader>
          {hasSelected ? (
            <>
              <ReceiptApplications>
                {group_applications.map((groupApplication) => {
                  const groupFields = (
                    admission.groups.find(
                      (group) => group.pk === groupApplication.group.pk,
                    )?.header_fields ?? []
                  ).filter((field): field is InputFieldModel => "id" in field);

                  return (
                    <ReceiptApplication key={groupApplication.group.pk}>
                      <ReceiptApplicationHeader>
                        {groupApplication.group.logo && (
                          <ReceiptLogo
                            src={groupApplication.group.logo}
                            alt=""
                            aria-hidden="true"
                            onError={(event) => {
                              event.currentTarget.hidden = true;
                            }}
                          />
                        )}
                        <ReceiptGroupName>
                          {groupApplication.group.name}
                        </ReceiptGroupName>
                      </ReceiptApplicationHeader>
                      {groupApplication.group.response_label && (
                        <ReceiptPrompt>
                          {groupApplication.group.response_label}
                        </ReceiptPrompt>
                      )}
                      <ReceiptText>{groupApplication.text}</ReceiptText>
                      {groupFields.length > 0 && (
                        <GroupAnswers>
                          {groupFields.map((field) => (
                            <GroupAnswer key={field.id}>
                              <ReceiptLabel>{field.title}</ReceiptLabel>
                              <ReceiptValue>
                                {formatResponse(
                                  groupApplication.header_fields_response?.[
                                    field.id
                                  ],
                                )}
                              </ReceiptValue>
                            </GroupAnswer>
                          ))}
                        </GroupAnswers>
                      )}
                    </ReceiptApplication>
                  );
                })}
                <ReceiptNotes aria-label="Informasjon om komitésøknader">
                  <ReceiptNote>
                    <Info aria-hidden="true" />
                    <span>
                      Her ser du komiteene du har søkt på, med eventuelle egne
                      spørsmål under hver komité.
                    </span>
                  </ReceiptNote>
                </ReceiptNotes>
              </ReceiptApplications>
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

const ReceiptFields = styled.div`
  display: flex;
  flex-direction: column;
`;

const ReceiptField = styled.div`
  padding: var(--spacing-lg) 0;
  border-bottom: var(--border-width-default) solid var(--color-border-soft);

  &:first-child {
    padding-top: 0;
  }

  &:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }
`;

const ReceiptLabel = styled.span`
  display: block;
  margin-bottom: var(--spacing-xs);
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-caps);
  text-transform: uppercase;
`;

const ReceiptValue = styled.span`
  color: var(--color-text-primary);
  font-size: var(--font-size-ui);
  font-weight: var(--font-weight-medium);
`;

const ReceiptNotes = styled.aside`
  display: grid;
  gap: var(--spacing-md);
  max-width: var(--content-width-prose);
  margin-top: var(--spacing-lg);
`;

const ReceiptNote = styled.p`
  display: grid;
  grid-template-columns: var(--spacing-xl) minmax(0, 1fr);
  gap: var(--spacing-sm);
  align-items: start;
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-copy);

  svg {
    width: var(--spacing-lg);
    height: var(--spacing-lg);
    margin-top: 0.1em;
    color: var(--color-text-subtle);
  }
`;

const ReceiptApplications = styled.div`
  display: flex;
  flex-direction: column;
`;

const ReceiptApplication = styled.article`
  padding: var(--spacing-xl) 0;
  border-top: var(--border-width-default) solid var(--color-border-soft);

  &:first-child {
    padding-top: 0;
    border-top: 0;
  }

  &:last-child {
    padding-bottom: 0;
  }
`;

const ReceiptApplicationHeader = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
`;

const ReceiptLogo = styled.img`
  width: var(--avatar-size-sm);
  height: var(--avatar-size-sm);
  object-fit: contain;
  flex: none;

  &[hidden] {
    display: none;
  }
`;

const ReceiptGroupName = styled.h3`
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
`;

const ReceiptPrompt = styled.p`
  margin: 0 0 var(--spacing-md);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-copy);
`;

const ReceiptText = styled.p`
  margin: 0;
  color: var(--color-text-body);
  font-size: var(--font-size-ui);
  line-height: var(--line-height-copy);
  white-space: pre-wrap;
`;

const GroupAnswers = styled.dl`
  display: grid;
  gap: var(--spacing-md);
  margin: var(--spacing-lg) 0 0;
`;

const GroupAnswer = styled.div`
  display: grid;
  gap: var(--spacing-xs);
`;
