/**
 *
 * Wrapper for the committee application
 *
 */

import { media } from "src/styles/mediaQueries";
import { Card } from "src/components/Card";

const Wrapper = Card.extend`
  display: grid;
  margin: 2rem 0rem;
  grid-template-columns: 1fr 14em;
  grid-template-rows: 10em auto;
  grid-template-areas:
    "response logoname"
    "input input";
  align-items: center;

  ${media.handheld`
    grid-template-columns: auto;
    grid-template-rows: repeat(3, auto);
    grid-template-areas:
      "logoname"
      "response"
      "input";
    margin: 1em 0;
    `};

  &:last-of-type {
    margin-bottom: 3em;
  }
`;

export default Wrapper;
