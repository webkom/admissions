import React, { Component } from "react";
import Application from "./Application";

class CommitteeApplication extends Component {
  componentDidMount() {
    setTimeout(this.initializeValue, 0);
  }

  initializeValue = () => {
    var committeeName = this.props.committee.name.toLowerCase();

    var restoredApplicationText = JSON.parse(
      sessionStorage.getItem("applicationText")
    );

    if (
      restoredApplicationText != null &&
      restoredApplicationText[committeeName]
    ) {
      this.props.form.setFieldValue(
        committeeName,
        restoredApplicationText[committeeName]
      );
    }
  };

  render() {
    return <Application {...this.props} />;
  }
}

export default CommitteeApplication;
