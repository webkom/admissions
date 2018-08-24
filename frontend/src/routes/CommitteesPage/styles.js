import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import LinkButton from "src/components/LinkButton";

export const PageWrapper = styled.div`
  width: 100%;
  margin: 0 auto 4em auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-items: center;
  ${media.handheld`
    width: 95vw;
    `};
`;

export const PageTitle = styled.h1`
  font-size: 3rem;
  margin: 0.2em 0 0.5em 0;
  line-height: 1.2em;
  text-align: center;
  ${media.handheld`
    margin: 0 1em 0 1em;
    font-size: 1.5rem;
  `};
`;

export const CommitteeWrapper = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;

  ${media.handheld`
    width: 95vw;
    grid-template-columns: 1fr;
    grid-gap: 0em;
    `};
`;

export const NextCard = styled.div`
  width: 100%;
  margin-top: 2em;
  display: flex;
  align-items: center;
  justify-contents: center;
`;

export const NextButton = styled(LinkButton)`
  background: white;
  width: 50%;
  color: black;

  &:hover {
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  }
`;
