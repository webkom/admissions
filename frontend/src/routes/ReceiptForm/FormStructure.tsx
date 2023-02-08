import React from "react";
import { Form, Field } from "formik";
import FormatTime from "src/components/Time/FormatTime";
import Icon from "src/components/Icon";
import LegoButton from "src/components/LegoButton";
import ConfirmModal from "src/components/ConfirmModal";
import Application from "src/containers/GroupApplication/Application";
import PriorityTextField from "src/routes/ApplicationForm/PriorityTextField";
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
  InformationSection,
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

interface FormStructureProps {
  toggleIsEditing: () => void;
}

const FormStructure: React.FC<FormStructureProps> = ({ toggleIsEditing }) => {
  const { admissionId } = useParams();
  const navigate = useNavigate();
  const deleteApplicationMutation = useDeleteMyApplicationMutation(
    admissionId ?? ""
  );

  const { data: myApplication } = useMyApplication(admissionId ?? "");
  const { data: admission } = useAdmission(admissionId ?? "");
  const { groups } = admission ?? {};

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
          Søknaden ble sist registrert
          {myApplication && (
            <StyledSpan bold>
              <FormatTime format="EEEE d. MMMM, kl. HH:mm:ss">
                {myApplication.updated_at}
              </FormatTime>
            </StyledSpan>
          )}
        </TimeStamp>
        <InformationSection>
          <InfoText>
            Tusen takk for din søknad!  Dersom du har noen spørsmål eller innspill til prosessen kan dette gjøres ved å sende en e-post til <a href='mailto:backup-rekruttering@abakus.no'> backup-rekruttering@abakus.no</a>.

          </InfoText>
          <InfoText> Planen videre:
            <ul>
              <li> - 19. februar kl. 23:59: Søknadsfrist</li>
              <li> - 13.feb - 21. februar: Kaffeprat*</li>
              <li> - 22. feb: Du får svar på om du kommer med eller ikke. Kommer du ikke med i år anbefaler vi deg å søke til neste år igjen! Hold gjerne av ettermiddagen i tilfelle du blir tatt opp </li>
            </ul>
          </InfoText>
          <InfoText>
            *Dette er en lavterskelsamtale for at du skal bli bedre kjent med oss og vi bedre kjent med deg. Dersom du er på utveksling vil samtalene foregå over Zoom. Du vil bli kontaktet av to backupere for å finne tid som passer:)
          </InfoText>

        </InformationSection>

        <EditWrapper>
          <EditInfo>
            <Text>
              Du kan
              <StyledSpan bold> fritt endre søknaden</StyledSpan> din frem til{" "}
              {admission && (
                <StyledSpan bold red>
                  <FormatTime format="EEEE d. MMMM">
                    {admission.public_deadline}
                  </FormatTime>
                </StyledSpan>
              )}{" "}
              og backup vil kun se den siste versjonen.
            </Text>
            <Notice>
              <StyledSpan bold>Merk:</StyledSpan> Oppdateringer etter
              søknadsfristen kan ikke garanteres å bli sett av backup.
            </Notice>
          </EditInfo>
          <EditActions>
            <LegoButton
              icon="arrow-forward"
              iconPrefix="ios"
              onClick={toggleIsEditing}
            >
              Endre søknad
            </LegoButton>
            <ConfirmModal
              title="Slett søknad"
              Component={({ onClick }) => (
                <LegoButton onClick={onClick} buttonStyle="secondary">
                  {deleteApplicationMutation.isLoading
                    ? "Sletter søknad..."
                    : deleteApplicationMutation.isError
                      ? "Klarte ikke slette søknad"
                      : deleteApplicationMutation.isSuccess
                        ? "Søknad slettet!"
                        : "Slett søknad"}
                </LegoButton>
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

      <FormHeader>
        <Title>Innsendt data</Title>
      </FormHeader>

      <Form>
        <SeparatorLine />

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

          <HelpText>
            <Icon name="information-circle-outline" />
            Alle i backup kan se det du skriver i søknaden din
          </HelpText>
          <Field
            name="priorityText"
            component={PriorityTextField}
            label="Hvilken klasse og linje går du, og skal du på utveksling neste år?"
            disabled={true}
          />
        </GeneralInfoSection>
        <SeparatorLine />
        <GroupsSection isSingleGroupAdmission={groups?.length === 1}>
          {myApplication.group_applications.length > 0 ? (
            <Applications>
              {myApplication.group_applications.map((groupApplication) => {
                const group = groups?.find(
                  (group) => group.pk === groupApplication.group.pk
                );
                if (!group) return null;

                return (
                  <Field
                    component={Application}
                    group={group}
                    name={group.name.toLowerCase()}
                    responseLabel={group.response_label}
                    key={group.pk}
                    disabled={true}
                  />
                );
              })}
            </Applications>
          ) : (
            <NoChosenGroupsWrapper>
              <NoChosenTitle>Du har ikke valgt noen komiteer.</NoChosenTitle>
              <NoChosenSubTitle>
                Send inn en ny søknad for å velge komitéer.
              </NoChosenSubTitle>
              <LegoButton
                icon="arrow-forward"
                iconPrefix="ios"
                to="/velg-komiteer"
              >
                Velg komiteer
              </LegoButton>
            </NoChosenGroupsWrapper>
          )}
        </GroupsSection>
      </Form>
    </PageWrapper>
  );
};

export default FormStructure;
