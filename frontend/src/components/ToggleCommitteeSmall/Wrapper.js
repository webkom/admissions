/**
 *
 * Wrapper for the small committee toggle.
 *
 */

import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const Wrapper = styled.div`
  display: flex;
  align-items: center;
  margin: 0.5em;
  ${media.handheld`
      width: 50%;
      margin: 0;
    `};
`;

export default Wrapper;
