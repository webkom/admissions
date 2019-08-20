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
      <Title>Opptak til komiteer</Title>
      {children}
    </Container>
  );
};

export default LandingPageSkeleton;

/** Styles **/

export const Container = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 130px auto 2rem auto;
  max-width: var(--lego-max-width);
  ${media.handheld`
    margin: 2em 1em 3em 1em;
    `};
`;

const BrandContainer = styled.div`
  max-width: 600px;
`;

const Title = styled.h1`
  font-size: 4rem;
  margin-top: 30px;
  ${media.handheld`
    font-size: 2.5rem;
  `};
`;
