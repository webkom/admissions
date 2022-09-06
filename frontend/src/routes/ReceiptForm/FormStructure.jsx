import React from "react";
import { Form, Field } from "formik";
import FormatTime from "src/components/Time/FormatTime";
import Icon from "src/components/Icon";
import LegoButton from "src/components/LegoButton";
import ConfirmModal from "src/components/ConfirmModal";
import Application from "src/containers/GroupApplication/Application";
import PriorityTextField from "src/routes/ApplicationForm/PriorityTextField";
import PhoneNumberField from "src/routes/ApplicationForm/PhoneNumberField";
import { useAdmission, useGroups, useMyApplication } from "src/query/hooks";
import { useDeleteMyApplicationMutation } from "src/query/mutations";
import { useNavigate } from "react-router-dom";
import {
  Applications,
  EditActions,
  EditInfo,
  EditWrapper,
  FormHeader,
  GeneralInfoSection,
  GroupsSection,
  HelpText,
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

const FormStructure = ({ toggleIsEditing }) => {
  const navigate = useNavigate();
  const deleteApplicationMutation = useDeleteMyApplicationMutation();

  const { data: admission } = useAdmission();
  const { data: myApplication } = useMyApplication();
  const { data: groups } = useGroups();

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
              og komiteene vil kun se den siste versjonen.
            </Text>
            <Notice>
              <StyledSpan bold>Merk:</StyledSpan> Oppdateringer etter
              søknadsfristen kan ikke garanteres å bli sett av komiteen(e) du
              søker deg til.
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
                <LegoButton
                  onClick={onClick}
                  buttonStyle="secondary"
                  size="medium"
                >
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
                deleteApplicationMutation.mutate(null, {
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
        <GeneralInfoSection>
          <SectionHeader>Generelt</SectionHeader>
          <HelpText>
            <Icon name="information-circle-outline" />
            Mobilnummeret vil bli brukt til å kalle deg inn på intervju av
            komitéledere.
          </HelpText>
          <Field
            name="phoneNumber"
            component={PhoneNumberField}
            disabled={true}
          />

          <HelpText>
            <Icon name="information-circle-outline" />
            Kun leder av Abakus kan se det du skriver inn i prioriterings- og
            kommentarfeltet.
            <Icon name="information-circle-outline" />
            Det er ikke sikkert prioriteringslisten vil bli tatt hensyn til.
            Ikke søk på en komité du ikke ønsker å bli med i.
          </HelpText>
          <Field
            name="priorityText"
            component={PriorityTextField}
            label="Prioriteringer, og andre kommentarer"
            optional
            disabled={true}
          />
        </GeneralInfoSection>
        <SeparatorLine />
        <GroupsSection>
          <Sidebar>
            <div>
              <SectionHeader>Komiteer</SectionHeader>
              <HelpText>
                <Icon name="information-circle-outline" />
                Her skriver du søknaden til komiteen(e) du har valgt. Hver
                komité kan kun se søknaden til sin egen komité.
              </HelpText>
            </div>
          </Sidebar>
          {myApplication.group_applications.length > 0 ? (
            <Applications>
              {myApplication.group_applications.map((groupApplication) => {
                const group = groups.find(
                  (group) => group.pk === groupApplication.group.pk
                );
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
