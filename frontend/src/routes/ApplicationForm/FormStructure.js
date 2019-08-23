import React from "react";
import styled from "styled-components";
import { Form, Field } from "formik";
import { media } from "src/styles/mediaQueries";
import Moment from "react-moment";
import "moment/locale/nb";
Moment.globalLocale = "nb";

import Icon from "src/components/Icon";
import PriorityTextField from "./PriorityTextField";
import PhoneNumberField from "./PhoneNumberField";
import LegoButton from "src/components/LegoButton";

const FormStructure = ({
  admission,
  hasSelected,
  SelectedCommitteItems,
  ChooseCommitteeItems,
  handleSubmit,
  isSubmitting,
  isValid
}) => (
  <PageWrapper>
    <Title>Skriv din søknad og send inn!</Title>
    <Form>
      <SeparatorLine />
      <GeneralInfoSection>
        <SectionHeader>Generelt</SectionHeader>
        <HelpText>
          <Icon name="information-circle-outline" />
          Mobilnummeret vil bli brukt til å kalle deg inn på intervju av
          komitéledere.
        </HelpText>
        <Field name="phoneNumber" component={PhoneNumberField} />

        <HelpText>
          <Icon name="information-circle-outline" />
          Kun leder av Abakus kan se det du skriver inn i prioriterings- og
          kommentarfeltet.
        </HelpText>
        <Field
          name="priorityText"
          component={PriorityTextField}
          label="Prioriteringer, og andre kommentarer"
          optional
        />
      </GeneralInfoSection>
      <SeparatorLine />
      <CommitteesSection>
        <SectionHeader>Komiteer</SectionHeader>
        <HelpText>
          <Icon name="information-circle-outline" />
          Her skriver du søknaden til komiteen(e) du har valgt. Hver komité kan
          kun se søknaden til sin egen komité.
        </HelpText>

        <ToggleCommitteesWrapper>
          {ChooseCommitteeItems}
        </ToggleCommitteesWrapper>

        {hasSelected ? (
          <Applications>{SelectedCommitteItems}</Applications>
        ) : (
          <div>
            <NoChosenCommittees>
              Du har ikke valgt noen komiteer.
            </NoChosenCommittees>
            <NoChosenCommitteesSmallInfo>
              Bruk lista på toppen for å velge komiteer
            </NoChosenCommitteesSmallInfo>
          </div>
        )}
      </CommitteesSection>
      <SeparatorLine />

      <SubmitSection>
        <div>
          {admission && (
            <div>
              <ApplicationDateInfo>
                <StyledSpan bold>Søknadsfristen</StyledSpan> er{" "}
                <StyledSpan bold red>
                  <Moment format="dddd Do MMMM">
                    {admission.public_deadline}
                  </Moment>
                </StyledSpan>
                <StyledSpan red>
                  <Moment format=", \k\l. HH:mm:ss">
                    {admission.public_deadline}
                  </Moment>
                </StyledSpan>
                .
              </ApplicationDateInfo>
              <ApplicationDateInfo>
                Etter dette kan du <StyledSpan bold>endre den</StyledSpan> frem
                til{" "}
                <StyledSpan bold red>
                  <Moment format="dddd Do MMMM">
                    {admission.application_deadline}
                  </Moment>
                </StyledSpan>
                <StyledSpan red>
                  <Moment format=", \k\l. HH:mm:ss">
                    {admission.application_deadline}
                  </Moment>
                </StyledSpan>
              </ApplicationDateInfo>
            </div>
          )}
          <SubmitInfo>
            Oppdateringer etter endringsfristen kan ikke garanteres å bli sett
            av komiteen(e) du søker deg til.
          </SubmitInfo>
          <SubmitInfo>
            Din søknad til hver komité kan kun ses av den aktuelle komiteen og
            leder av Abakus. All søknadsinformasjon slettes etter opptaket er
            gjennomført.
          </SubmitInfo>
          <SubmitInfo>Du kan når som helst trekke søknaden din.</SubmitInfo>
        </div>
        {hasSelected && (
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
        )}
      </SubmitSection>
    </Form>
  </PageWrapper>
);

export default FormStructure;

/** Styles **/

const PageWrapper = styled.div`
  width: 100%;
  padding: 0 1rem;
  margin: 0 auto 4em auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const Title = styled.h1`
  color: rgba(129, 129, 129, 0.59);
  font-size: 1.3rem;
  margin: 1.6rem 0 1.3rem;
  line-height: 1.5em;

  ${media.handheld`
    margin: 1.5rem 1rem;
    font-size: 1.2rem;
    line-height: 1.2em;
  `};
`;

const SeparatorLine = styled.div`
  display: block;
  background: var(--lego-gray-medium);
  height: 1px;
`;

const GeneralInfoSection = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  grid-template-areas:
    "header header"
    "input input";
  grid-gap: 1rem 2rem;
  max-width: 750px;
  margin-bottom: 1.5rem;

  h2 {
    grid-area: header;
    margin-bottom: -1.5rem;
  }

  span {
    margin-top: calc(1rem + 16px);
  }
`;

const SectionHeader = styled.h2`
  font-size: 1.3rem;
  margin: 1rem 0 0;
  letter-spacing: 1px;
`;

const HelpText = styled.span`
  color: rgba(57, 75, 89, 0.75);
  font-size: 0.9rem;
  line-height: 1.2rem;
  display: flex;
  margin-left: calc(-2.6rem + 4px);

  i {
    color: var(--lego-gray-medium);
    font-size: 1.6rem;
    margin-right: 1rem;
  }
`;

const CommitteesSection = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  grid-template-areas:
    "header header"
    "info applications"
    "togglecommittees applications";
  grid-gap: 1rem 2rem;
  max-width: 750px;

  h2 {
    grid-area: header;
    margin-bottom: -1.5rem;
  }

  span {
    grid-area: info;
    margin-top: calc(1rem + 16px);
  }
`;

const ToggleCommitteesWrapper = styled.div`
  grid-area: togglecommittees;
  display: flex;
  flex-wrap: wrap;
  margin: 0 8em 2em;

  ${media.handheld`
    width: 80%;
    margin: 2em auto;
    `};
`;

const Applications = styled.div`
  grid-area: applications;
`;

const SubmitSection = styled.div`
  display: grid;
  grid-template-columns: 4fr 1fr;
  max-width: 750px;
  margin-top: 2rem;
  align-items: center;
`;

const StyledSpan = styled.span.attrs(props => ({
  red: props.red ? true : false,
  bold: props.bold ? "600" : "normal"
}))`
  color: ${props => (props.red ? "var(--lego-red)" : "inherit")};
  font-weight: ${props => props.bold};
`;

const ApplicationDateInfo = styled.p`
  font-size: 0.95rem;
  line-height: 1.3rem;
  margin-top: 0rem;
`;

const SubmitInfo = styled.p`
  font-size: 0.9rem;
  color: rgba(57, 75, 89, 0.75);
  line-height: 1.3rem;
  padding-right: 3rem;
`;

/*
 * No chosen committees text
 */

const NoChosenCommittees = styled.span`
  font-size: 2rem;
  font-family: var(--font-family);
  color: gray;
  text-align: center;
  display: block;
  margin-top: 2em;
`;

/*
 * No chosen committees text
 */

const NoChosenCommitteesSmallInfo = styled.span`
  font-size: 1.3rem;
  font-family: var(--font-family);
  color: gray;
  text-align: center;
  display: block;
  padding-bottom: 2em;
`;
