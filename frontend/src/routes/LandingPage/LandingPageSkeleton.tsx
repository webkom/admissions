import React, { PropsWithChildren } from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

import AbakusLogo from "src/components/AbakusLogo";
import { isLoggedIn, isManager } from "src/utils/djangoData";
import LinkButton from "src/components/LinkButton";

const LandingPageSkeleton: React.FC<PropsWithChildren> = ({ children }) => {
  return (
    <Container>
      <BrandContainer>
        <AbakusLogo />
      </BrandContainer>
      <Title>Opptak</Title>
      {children}
      {isManager() && (
        <LegoButtonWrapper>
          <LinkButton to={`/manage/`}>Administrer opptak</LinkButton>
        </LegoButtonWrapper>
      )}
      <BottomLinkWrapper>
        {!isLoggedIn() ? (
          <a href="/login/lego/">Logg inn</a>
        ) : (
          <a href="/logout/">Logg ut</a>
        )}
      </BottomLinkWrapper>
    </Container>
  );
};

export default LandingPageSkeleton;

/** Styles **/

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0 auto;
  padding-top: 2rem;
  width: 80%;
  max-width: 100%;
  min-height: 100vh;
  ${media.portrait`
    width: 90%;
  `}
  ${media.handheld`
    width: initial;
    padding: 1em 0.2em 2em 0.2em;
    `};
`;

const BrandContainer = styled.div`
  max-width: 200px;

  ${media.handheld`
    margin: 0 1rem 0 1rem;
    width: 35%;
    `};
`;

const Title = styled.h1`
  font-size: 1.8rem;
  margin-top: 5px;
  ${media.handheld`
    font-size: 1.3rem;
  `};
`;

const LegoButtonWrapper = styled.div`
  margin-top: 3em;
`;

const BottomLinkWrapper = styled.div`
  display: flex;
  flex-grow: 1;
  align-items: flex-end;
  padding-top: 2rem;
  padding-bottom: 0.2rem;
`;
