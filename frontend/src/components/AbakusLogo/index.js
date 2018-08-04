import React from "react";
import { Link } from "react-router-dom";

import darkLogo from "assets/logo-dark.png";
import Logo from "./Logo";

const AbakusLogo = ({ size }) => (
  <Link to="/">
    <Logo size={size} src={darkLogo} />
  </Link>
);

export default AbakusLogo;
