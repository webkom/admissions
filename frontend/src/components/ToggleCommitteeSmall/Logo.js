/**
 *
 * Committee logo for the small committee toggle.
 *
 */

import styled from "styled-components";
import React from "react";
import { media } from "src/styles/mediaQueries";

const UnstyledLogo = ({ className, logo }) => (
  <img className={className} src={logo} alt="Logo" />
);

const Logo = styled(UnstyledLogo)`
  object-fit: scale-down;
  width: 2.3em;
  ${media.handheld`
      display: none`};
`;

export default Logo;
