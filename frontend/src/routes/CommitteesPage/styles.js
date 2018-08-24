import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import LinkButton from "src/components/LinkButton";

export const PageWrapper = styled.div`
  width: 100%;
  margin: 0 auto 4em auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
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
  background: #db3737;
  width: 40%;
  color: white;
  padding: 1em;
  opacity: 0.9;
  border: 1px solid #a82a2a;

  &:hover {
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
    opacity: 1;
  }

  &:active {
    opacity: 0.9;
  }

  ${media.handheld`
    width: 90%;
    `};
`;
