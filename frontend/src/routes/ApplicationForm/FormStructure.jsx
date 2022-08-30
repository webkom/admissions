import React, { useEffect } from "react";
import { Form, Field } from "formik";

import FormatTime from "src/components/Time/FormatTime";
import Icon from "src/components/Icon";
import LegoButton from "src/components/LegoButton";
import ConfirmModal from "src/components/ConfirmModal";
import PriorityTextField from "./PriorityTextField";
import PhoneNumberField from "./PhoneNumberField";
import ToggleGroups from "./ToggleGroups";
import ErrorFocus from "./ErrorFocus";
import djangoData from "src/utils/djangoData";
import { useDeleteMyApplicationMutation } from "../../query/mutations";
import { useNavigate } from "react-router-dom";
import {
  ApplicationDateInfo,
  Applications,
  CancelButtonContainer,
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
  SubmitInfo,
  SubmitSection,
  Text,
  TimeStamp,
  Title,
} from "./FormStructureStyle";

const FormStructure = ({
  admission,
  groups,
  selectedGroups,
  toggleGroup,
  toggleIsEditing,
  hasSelected,
  SelectedGroupItems,
  handleSubmit,
  isSubmitting,
  isValid,
  isEditing,
  myApplication,
  onCancel,
}) => {
  const navigate = useNavigate();
  const deleteApplicationMutation = useDeleteMyApplicationMutation();

  useEffect(() => {
    if (!deleteApplicationMutation.isSuccess) return;
    toggleIsEditing();
    sessionStorage.clear();
    navigate("/");
  }, [deleteApplicationMutation.isSuccess]);

  return (
    <PageWrapper>
      {!isEditing && (
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
                onConfirm={() => deleteApplicationMutation.mutate()}
              />
            </EditActions>
          </EditWrapper>
        </RecieptInfo>
      )}

      <FormHeader>
        <Title>
          {isEditing ? "Skriv din søknad og send inn!" : "Innsendt data"}
        </Title>
        {isEditing && djangoData.user.has_application && (
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
            komitéledere.
          </HelpText>
          <Field
            name="phoneNumber"
            component={PhoneNumberField}
            disabled={!isEditing}
          />

          <HelpText>
            <Icon name="information-circle-outline" />
            Kun leder av Abakus kan se det du skriver inn i prioriterings- og
            kommentarfeltet.
            <Icon name="information-circle-outline" />
            Det er ikke sikkert prioriteringslisten vil bli tatt hensyn til.
            Ikke søk på en komite du ikke ønsker å bli med i.
          </HelpText>
          <Field
            name="priorityText"
            component={PriorityTextField}
            label="Prioriteringer, og andre kommentarer"
            optional
            disabled={!isEditing}
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

              {isEditing && (
                <ToggleGroups
                  groups={groups}
                  selectedGroups={selectedGroups}
                  toggleGroup={toggleGroup}
                />
              )}
            </div>
          </Sidebar>
          {hasSelected ? (
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
                to="/velg-komiteer"
              >
                Velg komiteer
              </LegoButton>
            </NoChosenGroupsWrapper>
          )}
        </GroupsSection>
        <SeparatorLine />

        {isEditing && (
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
                Oppdateringer etter søknadsfristen kan ikke garanteres å bli
                sett av komiteen(e) du søker deg til.
              </SubmitInfo>
              <SubmitInfo>
                Din søknad til hver komité kan kun ses av den aktuelle komiteen
                og leder av Abakus. All søknadsinformasjon slettes etter
                opptaket er gjennomført.
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
        )}
        <ErrorFocus />
      </Form>
    </PageWrapper>
  );
};

export default FormStructure;
