import React, { useEffect } from "react";
import Application from "./Application";

const GroupApplication = (props) => {
  useEffect(() => {
    setTimeout(initializeValue, 0);
  }, []);

  const initializeValue = () => {
    const groupName = props.group.name.toLowerCase();

    const restoredApplicationText = JSON.parse(
      sessionStorage.getItem("applicationText")
    );

    if (restoredApplicationText != null && restoredApplicationText[groupName]) {
      props.form.setFieldValue(groupName, restoredApplicationText[groupName]);
    }
  };

  return <Application {...props} />;
};

export default GroupApplication;
