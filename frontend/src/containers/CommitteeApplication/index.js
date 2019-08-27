import React, { Component } from "react";
import Application from "./Application";

class CommitteeApplication extends Component {
  componentDidMount() {
    setTimeout(this.initializeValue, 0);
  }

  initializeValue = () => {
    var committee = this.props.committee.toLowerCase();

    var restoredApplicationText = JSON.parse(
      sessionStorage.getItem("applicationText")
    );

    if (restoredApplicationText != null && restoredApplicationText[committee]) {
      this.props.form.setFieldValue(
        committee,
        restoredApplicationText[committee]
      );
    }
  };

  render() {
    return <Application {...this.props} />;
  }
}

export default CommitteeApplication;
