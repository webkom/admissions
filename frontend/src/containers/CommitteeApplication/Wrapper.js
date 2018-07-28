/**
 *
 * Wrapper for the committee application
 *
 */

import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const Wrapper = styled.div`
  display: grid;
  margin: 0.5em;
  grid-template-columns: 11em 1fr;
  grid-template-rows: repeat(3, auto);
  grid-template-areas:
    "logo committeeName"
    "logo response"
    ". input";
  align-items: center;

  ${media.handheld`
    grid-template-columns: 1fr 5fr;
    grid-template-rows: 3rem repeat(2, auto);
    grid-template-areas:
      "logo committeeName"
      "response response"
      "input input";
    `};
`;

export default Wrapper;
