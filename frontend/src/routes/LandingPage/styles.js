import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import { Card, CardParagraph, CardTitle } from "src/components/Card";
import { MainPageTitle } from "src/components/PageTitle";

export const InfoBox = styled(Card)`
  display: flex;
  flex-direction: column;
  margin: 1em 1em 2.5em 1em;
  padding: 2em;
  max-width: 600px;
  ${media.handheld`
    margin-top: 2em;
    margin-bottom: 2em;
    padding: 2em 1em;
    `};
`;
export const InfoBoxText = styled(CardParagraph)`
  text-align: center;
  margin: 0.5em 1.5em;
  ${media.handheld`
    margin: 0.5em 0;
    `};
`;
export const InfoBoxTitle = styled(CardTitle)`
  text-align: center;
  margin-top: 0;
  ${media.handheld`
    `};
`;

export const PageSubTitle = styled(MainPageTitle)`
  color: gray;
  font-size: 2.5rem;
`;

export const Container = styled.div`
  min-height: 100vh;
  margin: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin: 0 0.7em;
  ${media.handheld`
    margin: 2em 1em 3em 1em;
    `};
`;

export const LinkWrapper = styled.div`
  display: flex;

  > a {
    margin: 0 0.7em;
    width: 13em;

    ${media.handheld`
      margin: 1em;
      `};
  }

  ${media.handheld`
    flex-direction: column;
    `};
`;
