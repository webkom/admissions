import React from "react";
import { Form, Field } from "formik";
import FormatTime from "src/components/Time/FormatTime";
import Icon from "src/components/Icon";
import LegoButton from "src/components/LegoButton";
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
              og {isRevy ? "revystyret" : "komiteene"} vil kun se den siste
              versjonen.
            </Text>
            <Notice>
              <StyledSpan bold>Merk:</StyledSpan> Oppdateringer etter
              søknadsfristen kan ikke garanteres å bli sett av{" "}
              {isRevy ? "revystyret" : "komiteen(e) du søker deg til"}.
            </Notice>
          </EditInfo>
          <EditActions>
            {admission && admission.is_open && (
              <LegoButton
                icon="arrow-forward"
                iconPrefix="ios"
                onClick={toggleIsEditing}
              >
                Endre søknad
              </LegoButton>
            )}
            <ConfirmModal
              title="Slett søknad"
              Component={({ onClick }) => (
                <LegoButton onClick={onClick} buttonStyle="secondary">
                  {deleteApplicationMutation.isPending
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
          <JsonFieldEditor
            sectionName="headerFields"
            fields={admission?.header_fields}
            disabled={true}
          />
        </GeneralInfoSection>
        <SeparatorLine />
        <GroupsSection>
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
                Søknadene vil brukes i opptaksprosessen, men alle søkere vil bli
                kalt inn til intervju.
              </HelpText>
            </div>
          </Sidebar>
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
              <LegoButton
                icon="arrow-forward"
                iconPrefix="ios"
                to={`/${admissionSlug}/velg-grupper`}
              >
                Velg {isRevy ? "grupper" : "komiteer"}
              </LegoButton>
            </NoChosenGroupsWrapper>
          )}
        </GroupsSection>
      </Form>
    </PageWrapper>
  );
};

export default FormStructure;
