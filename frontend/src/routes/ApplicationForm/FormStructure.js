import React from "react";
import styled from "styled-components";
import { Form, Field } from "formik";
import { media } from "src/styles/mediaQueries";

import Icon from "src/components/Icon";
import PriorityTextField from "./PriorityTextField";
import PhoneNumberField from "./PhoneNumberField";
import LegoButton from "src/components/LegoButton";

const FormStructure = ({
  hasSelected,
  SelectedCommitteItems,
  ChooseCommitteeItems,
  handleSubmit,
  isSubmitting,
  isValid
}) => (
  <div>
    <PageWrapper>
      <Title>Skriv din søknad og send inn!</Title>
      <Form>
        <SeparatorLine />
        <GeneralInfo>
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
        </GeneralInfo>
        <SeparatorLine />
        <ToggleCommitteeWrapper>{ChooseCommitteeItems}</ToggleCommitteeWrapper>

        {hasSelected ? (
          <div>{SelectedCommitteItems}</div>
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
      </Form>
    </PageWrapper>

    {hasSelected && (
      <LegoButton
        icon="paper-plane"
        iconPrefix="ios"
        onClick={handleSubmit}
        type="submit"
        disabled={isSubmitting}
        valid={isValid}
      >
        Send inn søknad
      </LegoButton>
    )}
  </div>
);

export default FormStructure;

/** Styles **/

export const PageWrapper = styled.div`
  width: 100%;
  padding: 0 1rem;
  margin: 0 auto 4em auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const Title = styled.h1`
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

export const GeneralInfo = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  grid-template-areas:
    "header header"
    "input input";
  grid-gap: 1rem 2rem;
  max-width: 800px;
  h2 {
    grid-area: header;
    margin-bottom: -1.5rem;
  }

  span {
    margin-top: calc(1rem + 16px);
  }
`;

export const SectionHeader = styled.h2`
  font-size: 1.3rem;
  margin: 1rem 0 0;
  letter-spacing: 1px;
`;

export const HelpText = styled.span`
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

/*
 * No chosen committees text
 */

export const NoChosenCommittees = styled.span`
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

export const NoChosenCommitteesSmallInfo = styled.span`
  font-size: 1.3rem;
  font-family: var(--font-family);
  color: gray;
  text-align: center;
  display: block;
  padding-bottom: 2em;
`;

/*
 * ToggleCommitteeWrapper
 */

export const ToggleCommitteeWrapper = styled.div`
  display: flex;
  flex-wrap: wrap;
  margin: 0 8em 2em;

  ${media.handheld`
    width: 80%;
    margin: 2em auto;
    `};
`;

/**
 *
 * Wrapper for the general input boxes, phone number + priorities
 *
 */
