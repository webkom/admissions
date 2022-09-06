import React from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

import AbakusLogo from "src/components/AbakusLogo";

const LandingPageSkeleton = ({ children }) => {
  return (
    <Container>
      <BrandContainer>
        <AbakusLogo />
      </BrandContainer>
      <Title>Opptak til Abakusrevyen</Title>
      {children}
    </Container>
  );
};

export default LandingPageSkeleton;

/** Styles **/

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 6rem auto 2rem auto;
  max-width: var(--lego-max-width);
  ${media.handheld`
    margin: 2em 1em 3em 1em;
    `};
`;

const BrandContainer = styled.div`
  max-width: 500px;

  ${media.handheld`
    margin: 1rem 1rem 0 1rem;;
    `};
`;

const Title = styled.h1`
  font-size: 3.2rem;
  margin-top: 20px;
  ${media.handheld`
    font-size: 2.5rem;
  `};
`;
