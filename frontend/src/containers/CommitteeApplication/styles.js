import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

export const ResponseLabelWrapper = styled.div`
  grid-area: response;

  margin: 0.5em 1em;
  font-family: Raleway, "Helvetica Neue", Arial, sans-serif;
  font-size: 0.95rem;
`;

export const WriteApplicationWrapper = styled.div`
  grid-area: input;

  margin: 0.5em 1em;
  font-family: Raleway, "Helvetica Neue", Arial, sans-serif;
  font-size: 1rem;
`;

export const LogoNameWrapper = styled.div`
  grid-area: logoname;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  margin: 0 2em;
`;

export const Name = styled.label`
  font-weight: bold;
  margin-bottom: 0.5em;
  font-size: 1.5em;
  grid-area: committeeName;

  ${media.handheld`
    font-size: 1.3em;
      `};
`;

/**
 *
 * Committee logo for the committee application
 *
 */

export const Logo = styled.img`
  object-fit: scale-down;
  width: 100%;
  height: 100%;
  grid-area: logo;
  justify-content: center;
  align-self: center;
  z-index: 1;

  ${media.handheld`
    padding: 0.3em;
      `};
`;
