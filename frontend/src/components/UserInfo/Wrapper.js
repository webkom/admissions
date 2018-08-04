/**
 *
 * Wrapper for the committee application
 *
 */

import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const Wrapper = styled.div`
  background: #d6d4d2;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-self: center;
  min-width: 50%;
  color: white;
  padding: 0.2em;
  margin: 1em 0;
  border-radius: 10px;

  ${media.handheld`
    width: 100%;
    `};
`;

export default Wrapper;
