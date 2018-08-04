import React, { Component } from "react";
import { CommitteeApplication as Subcomponent } from "./CommitteeApplication";

class CommitteeApplication extends Component {
  componentDidMount() {
    this.initializeValue();
  }

  initializeValue = () => {
    var committee = this.props.committee.toLowerCase();

    var restoredApplicationText = JSON.parse(
      sessionStorage.getItem("applicationText")
    );

    if (restoredApplicationText != null && restoredApplicationText[committee]) {
      this.props.form.setFieldValue(
        `${committee}`,
        restoredApplicationText[committee]
      );
    }
  };

  render() {
    return <Subcomponent {...this.props} />;
  }
}

export default CommitteeApplication;
