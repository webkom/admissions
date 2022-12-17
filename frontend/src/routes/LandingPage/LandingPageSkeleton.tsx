import React, { PropsWithChildren } from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

import AbakusLogo from "src/components/AbakusLogo";

const LandingPageSkeleton: React.FC<PropsWithChildren> = ({ children }) => {
  return (
    <Container>
      <BrandContainer>
        <AbakusLogo />
      </BrandContainer>
      <Title>Opptak</Title>
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
  margin: 0 auto;
  padding: 2rem 0 2rem 0;
  width: 80%;
  max-width: 100%;
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
