import React from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

import DecorativeLine from "src/components/DecorativeLine";
import Icon from "src/components/Icon";
import LandingPageSkeleton from "./LandingPageSkeleton";

const LandingPageNoAdmission = () => {
  return (
    <LandingPageSkeleton>
      <SubTitle>Ingen åpne opptak for øyeblikket</SubTitle>
      <InfoBox>
        <DecorativeLine vertical />
        <p>
          Komiteeopptak skjer vanligvis i september etter semesterstart. Følg
          med på{" "}
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
      <FancyLink
        href="https://abakus.no"
        target="_blank"
        rel="noopener noreferrer"
      >
        <FancyLinkText>Gå til abakus.no</FancyLinkText>
        <Icon name="arrow-forward" prefix="ios" />
      </FancyLink>
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

const FancyLink = styled.a`
  display: flex;
  margin-top: 2.5rem;
  align-items: center;

  > i {
    margin-left: 20px;
    font-size: 2.2rem;
  }

  &:hover {
    opacity: 0.7;
  }

  ${media.handheld`
    margin-top: 1.5rem;
    
    > i {
    margin-left: 15px;
    font-size: 1.6rem;
  }
  `};
`;

const FancyLinkText = styled.span`
  font-weight: 600;
  font-size: 1.4rem;
  display: inline-block;
  padding-bottom: 8px;
  position: relative;

  &:before {
    content: "";
    position: absolute;
    width: 85%;
    border-bottom: 2px solid var(--lego-red);
    bottom: 0;
    left: 7.5%;
  }

  ${media.handheld`
    font-size: 1.1rem;
    padding-bottom: 6px;
  `};
`;
