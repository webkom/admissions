/**
 *
 * Wrapper for the small committee toggle.
 *
 */

import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const Wrapper = styled.button`
  display: flex;
  flex: 1 1 20%;
  align-items: center;
  margin: 0.3em;
  font-family: Raleway, "Helvetica Neue", Arial, sans-serif;

  ${media.handheld`
      width: 50%;
      margin: 0;
    `};
`;

export default Wrapper;
