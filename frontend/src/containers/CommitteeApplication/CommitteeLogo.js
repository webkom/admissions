/**
 *
 * Committee name for the committee application
 *
 */

import React from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const UnstyledLogo = ({ className, logo }) => (
  <img className={className} src={logo} alt="Logo" />
);

const Logo = styled(UnstyledLogo)`
  object-fit: scale-down;
  width: 100%;
  height: 100%;
  grid-area: logo;
  justify-self: center;
  align-self: center;
  z-index: 1;

  ${media.handheld`
    padding: 0.3em;
      `};
`;

export default Logo;
