/**
 *
 * Committee name for the committee application
 *
 */

import React from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const UnstyledCommitteeName = ({ className, name }) => (
  <label htmlFor={name.toLowerCase()}>
    <span className={className}>{name}</span>
  </label>
);

const CommitteeName = styled(UnstyledCommitteeName)`
  font-weight: bold;
  margin: 0.5em;
  font-size: 1.5em;
  grid-area: committeeName;
  ${media.handheld`
    font-size: 1.3em;
      `};
`;

export default CommitteeName;
