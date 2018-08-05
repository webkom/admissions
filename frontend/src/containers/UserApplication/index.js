import React, { Component } from "react";

import Application from "src/components/Application";

import Wrapper from "./Wrapper";

class UserApplication extends Component {
  constructor(props) {
    super(props);
    this.state = {
      committeeApplications: []
    };
  }

  componentWillMount() {
    const { user, text, committee_applications } = this.props;

    const CommitteeApplications = committee_applications.map(
      (application, i) => {
        this.props.generateCSVData(
          user.full_name,
          user.email,
          user.username,
          text,
          application.committee.name,
          application.text
        );
        return (
          <Application
            key={user.username + "-" + i}
            committee={application.committee.name}
            text={application.text}
          />
        );
      }
    );

    this.setState({ committeeApplications: CommitteeApplications });
  }

  render() {
    const { user, text } = this.props;
    const { committeeApplications } = this.state;

    return (
      <Wrapper>
        <h2>{user.full_name}</h2>
        <h3>Prioriteringer og andre kommentarer: </h3>
        <p>{text}</p>
        <h3>Søknader: </h3>
        {committeeApplications}
      </Wrapper>
    );
  }
}

export default UserApplication;
