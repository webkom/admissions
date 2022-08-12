import React, { Component } from "react";
import Application from "./Application";

class GroupApplication extends Component {
  componentDidMount() {
    setTimeout(this.initializeValue, 0);
  }

  initializeValue = () => {
    var groupName = this.props.group.name.toLowerCase();

    var restoredApplicationText = JSON.parse(
      sessionStorage.getItem("applicationText")
    );

    if (restoredApplicationText != null && restoredApplicationText[groupName]) {
      this.props.form.setFieldValue(
        groupName,
        restoredApplicationText[groupName]
      );
    }
  };

  render() {
    return <Application {...this.props} />;
  }
}

export default GroupApplication;
