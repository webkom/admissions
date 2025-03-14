import React from "react";
import { Form, Field } from "formik";
import FormatTime from "src/components/Time/FormatTime";
import Icon from "src/components/Icon";
import ConfirmModal from "src/components/ConfirmModal";
import Application from "src/containers/GroupApplication/Application";
import PhoneNumberField from "src/routes/ApplicationForm/PhoneNumberField";
import { useAdmission, useMyApplication } from "src/query/hooks";
import { useDeleteMyApplicationMutation } from "src/query/mutations";
import { useNavigate, useParams } from "react-router-dom";
import {
  Applications,
  EditActions,
  EditInfo,
  EditWrapper,
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
  RecieptInfo,
  RecievedApplicationBanner,
  SectionHeader,
  SeparatorLine,
  Sidebar,
  StyledSpan,
  Text,
  TimeStamp,
  Title,
} from "src/routes/ApplicationForm/FormStructureStyle";
import { clearAllDrafts } from "src/utils/draftHelper";
import JsonFieldEditor from "src/components/JsonFieldEditor";
import { Button } from "@webkom/lego-bricks";
import LinkButton from "src/components/LinkButton";
import PriorityTextField from "../ApplicationForm/PriorityTextField";

interface FormStructureProps {
  toggleIsEditing: () => void;
}

const FormStructure: React.FC<FormStructureProps> = ({ toggleIsEditing }) => {
  const { admissionSlug } = useParams();
  const isRevy = admissionSlug === "revy";
  const navigate = useNavigate();
  const deleteApplicationMutation = useDeleteMyApplicationMutation(
    admissionSlug ?? "",
  );

  const { data: myApplication } = useMyApplication(admissionSlug ?? "");
  const { data: admission } = useAdmission(admissionSlug ?? "");
  const { groups } = admission ?? {};

  const isBackup = admission?.slug === "backup";
  const isSingleGroupAdmission = admission?.groups.length === 1;

  if (!admission) {
    return <p>Opptaket finnes ikke</p>;
  }

  if (!myApplication) {
    return <p>Du har ingen innsendte søknader.</p>;
  }

  return (
    <PageWrapper>
      <RecieptInfo>
        <Title>Kvittering for sendt søknad</Title>
        <RecievedApplicationBanner>
          <span>Vi har mottatt søknaden din!</span>
          <Icon name="checkmark" size="1.8rem" />
        </RecievedApplicationBanner>
        <TimeStamp>
          <Icon name="time" />
          Søknaden ble sist registrert{" "}
          <StyledSpan $bold>
            <FormatTime format="EEEE d. MMMM, kl. HH:mm:ss">
              {myApplication.updated_at}
            </FormatTime>
          </StyledSpan>
        </TimeStamp>
        <EditWrapper>
          <EditInfo>
            <Text>
              Du kan
              <StyledSpan $bold> fritt endre søknaden</StyledSpan> din frem til{" "}
              <StyledSpan $bold $red>
                <FormatTime format="EEEE d. MMMM">
                  {admission.public_deadline}
                </FormatTime>
              </StyledSpan>
              {!isSingleGroupAdmission &&
                ` og ${isRevy ? "revystyret" : "komiteene"} vil kun se den siste
              versjonen`}
              .
            </Text>
            <Notice>
              <StyledSpan $bold>Merk:</StyledSpan> Oppdateringer etter
              søknadsfristen kan ikke garanteres å bli sett
              {!isRevy &&
                !isSingleGroupAdmission &&
                " av komiteen(e) du søker deg til"}
              .
            </Notice>
          </EditInfo>
          <EditActions>
            {admission.is_open && (
              <Button onClick={toggleIsEditing}>Endre søknad</Button>
            )}
            <span />
            <ConfirmModal
              title="Slett søknad"
              trigger={({ onClick }) => (
                <Button onClick={onClick} danger>
                  {deleteApplicationMutation.isPending
                    ? "Sletter søknad..."
                    : deleteApplicationMutation.isError
                      ? "Klarte ikke slette søknad"
                      : deleteApplicationMutation.isSuccess
                        ? "Søknad slettet!"
                        : "Slett søknad"}
                </Button>
              )}
              message="Er du sikker på at du vil slette søknaden din?"
              onConfirm={() =>
                deleteApplicationMutation.mutate(undefined, {
                  onSuccess: () => {
                    clearAllDrafts();
                    navigate("/");
                  },
                })
              }
            />
          </EditActions>
        </EditWrapper>
      </RecieptInfo>

      {isBackup && (
        <>
          <FormHeader>
            <Title>Informasjon</Title>
          </FormHeader>
          <GeneralInfoSection $columnCount={1}>
            <SeparatorLine />
            <InfoText>
              Tusen takk for din søknad! Dersom du har noen spørsmål eller
              innspill til prosessen kan dette gjøres ved å sende en e-post til{" "}
              <a href="mailto:backup-rekruttering@abakus.no">
                backup-rekruttering@abakus.no
              </a>
              .
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
              *Dette er en lavterskelsamtale for at du skal bli bedre kjent med
              oss og vi blir bedre kjent med deg. Dersom du er på utveksling vil
              samtalene foregå over Zoom. Du vil bli kontaktet av to backupere
              for å finne tid som passer:)
            </InfoText>
          </GeneralInfoSection>
          <SeparatorLine />
        </>
      )}

      <FormHeader>
        <Title>Innsendt data</Title>
      </FormHeader>
      <Form>
        <SeparatorLine />
        <GeneralInfoSection>
          <SectionHeader>Generelt</SectionHeader>
          <HelpText>
            <Icon name="information-circle-outline" />
            Mobilnummeret vil bli brukt til å kalle deg inn på intervju.
          </HelpText>
          <Field
            name="phoneNumber"
            component={PhoneNumberField}
            disabled={true}
          />
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
                disabled={true}
              />
            </>
          )}
          <JsonFieldEditor
            sectionName="headerFields"
            fields={admission.header_fields}
            disabled={true}
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
                  Her skriver du søknaden til{" "}
                  {isRevy ? "gruppen(e)" : "komiteen(e)"} du har valgt.
                  {!isRevy &&
                    "Hver komité kan kun se søknaden til sin egen komité."}
                </HelpText>
                <HelpText>
                  <Icon name="information-circle-outline" />
                  Søknadene vil brukes i opptaksprosessen, men alle søkere vil
                  bli kalt inn til intervju.
                </HelpText>
              </div>
            </Sidebar>
          )}
          {myApplication.group_applications.length > 0 ? (
            <Applications>
              {myApplication.group_applications.map((groupApplication) => {
                const group = groups?.find(
                  (group) => group.pk === groupApplication.group.pk,
                );
                if (!group) return null;

                return (
                  <Field
                    component={Application}
                    group={group}
                    name={"groups." + group.name.toLowerCase()}
                    responseLabel={group.response_label}
                    key={group.pk}
                    disabled={true}
                  />
                );
              })}
            </Applications>
          ) : (
            <NoChosenGroupsWrapper>
              <NoChosenTitle>
                Du har ikke valgt noen {isRevy ? "grupper" : "komiteer"}.
              </NoChosenTitle>
              <NoChosenSubTitle>
                Send inn en ny søknad for å velge{" "}
                {isRevy ? "grupper" : "komiteer"}.
              </NoChosenSubTitle>
              <LinkButton to={`/${admissionSlug}/velg-grupper`}>
                Velg {isRevy ? "grupper" : "komiteer"}
              </LinkButton>
            </NoChosenGroupsWrapper>
          )}
        </GroupsSection>
      </Form>
    </PageWrapper>
  );
};

export default FormStructure;
