import React from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

import DecorativeLine from "src/components/DecorativeLine";
import LegoButton from "src/components/LegoButton";
import LandingPageSkeleton from "./LandingPageSkeleton";

const LandingPageNoAdmission = () => {
  return (
    <LandingPageSkeleton>
      <SubTitle>Ingen åpne opptak for øyeblikket</SubTitle>
      <InfoBox>
        <DecorativeLine vertical />
        <p>
          Opptak skjer vanligvis i september etter semesterstart. Følg med på{" "}
          <a href="https://abakus.no" target="_blank" rel="noopener noreferrer">
            abakus.no
          </a>{" "}
          eller på{" "}
          <a
            href="https://www.facebook.com/AbakusNTNU/"
            target="_blank"
            rel="noopener noreferrer"
          >
            vår facebook side
          </a>{" "}
          for kunngjøringer!
        </p>
      </InfoBox>
      <LegoButton
        href="https://abakus.no"
        icon="arrow-forward"
        iconPrefix="ios"
        buttonStyle="secondary"
      >
        Gå til abakus.no
      </LegoButton>
    </LandingPageSkeleton>
  );
};

export default LandingPageNoAdmission;

/** Styles **/

const SubTitle = styled.h2`
  margin-bottom: 0.6rem;
  font-size: 1.8rem;
  font-weight: 500;
  color: var(--lego-gray-dark);
  ${media.handheld`
    margin-top: 2rem;
    font-size: 1.5rem;
    line-height: 2rem;
    text-align: center;
  `};
`;

const InfoBox = styled.div`
  display: flex;
  max-width: 420px;
  margin-bottom: 2rem;

  > p {
    margin: 0 0 0 1rem;
    font-size: 1.1rem;
    line-height: 1.8rem;
    padding: 7px 0;
    a {
      white-space: nowrap;
    }
  }

  ${media.handheld`
  margin: 0 1rem;

    > p {
    font-size: 1rem;
    line-height: 1.5rem;
  `};
`;
