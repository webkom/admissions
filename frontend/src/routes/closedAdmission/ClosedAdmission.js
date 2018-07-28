import React, { Component } from "react";
import { Link } from "react-router-dom";

import AbakusLogo from "src/components/AbakusLogo";

class ClosedAdmission extends Component {
  render() {
    return (
      <div className="container flex-center">
        <div className="flex-center">
          <AbakusLogo />
          <h1>Du kan ikke søke nå</h1>
          <Link to="/">Gå til søknad</Link>
        </div>
      </div>
    );
  }
}

export default ClosedAdmission;
