import { media } from "src/styles/mediaQueries";
import { Card, CardParagraph, CardTitle } from "src/components/Card";

export const InfoBox = Card.extend`
  display: flex;
  flex-direction: column;
  margin: 1em 1em 2.5em 1em;
  padding: 2em;

  ${media.handheld`
    margin-top: 2em;
    margin-bottom: 2em;
    padding: 2em 1em;
    `};
`;
export const InfoBoxText = CardParagraph.extend`
  text-align: center;
  margin: 0.5em 1.5em;
  ${media.handheld`
    margin: 0.5em 0;
    `};
`;
export const InfoBoxTitle = CardTitle.extend`
  text-align: center;
  margin-top: 0;
  ${media.handheld`
    `};
`;
