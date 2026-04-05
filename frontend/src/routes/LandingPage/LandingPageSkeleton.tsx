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
  padding: 4rem 2rem;
  width: 100%;
  max-width: 1200px;
  min-height: 100vh;

  ${media.handheld`
    padding: 2rem 1rem;
  `};
`;

const BrandContainer = styled.div`
  max-width: 180px;
  margin-bottom: 2rem;
  transition: var(--transition-base);

  &:hover {
    transform: scale(1.02);
  }

  ${media.handheld`
    max-width: 140px;
  `};
`;

const Title = styled.h1`
  font-size: 3rem;
  font-weight: 800;
  margin-bottom: 1rem;
  color: #111827;
  letter-spacing: -0.04em;

  ${media.handheld`
    font-size: 2rem;
  `};
`;

const LegoButtonWrapper = styled.div`
  margin-top: 4rem;
`;

const BottomLinkWrapper = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 6rem;
  padding-bottom: 2rem;
  width: 100%;
  border-top: 1px solid #f3f4f6;
  padding-top: 2rem;

  a {
    color: #6b7280;
    font-size: 0.875rem;
    font-weight: 500;

    &:hover {
      color: #111827;
    }
  }
`;
