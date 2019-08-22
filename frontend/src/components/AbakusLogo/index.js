import React from "react";
import { Link } from "react-router-dom";
import styled from "styled-components";

import darkLogo from "assets/logo-dark.png";

const AbakusLogo = () => (
  <Link to="/" title="Go home">
    <Logo src={darkLogo} />
  </Link>
);

export default AbakusLogo;

/** Styles **/

const Logo = styled.img`
  display: block;
  object-fit: scale-down;
  width: 100%;
`;
