import React, { Component } from "react";
import { Link } from "react-router-dom";

import AbakusLogo from "src/components/AbakusLogo";

class AdminPage extends Component {
  render() {
    console.log(this.props);
    return (
      <div className="container flex-center">
        <div className="flex-center">
          <AbakusLogo />
          <h1>Admin Panel</h1>

          <Link to="/">Gå til søknad</Link>
        </div>
      </div>
    );
  }
}

export default AdminPage;
