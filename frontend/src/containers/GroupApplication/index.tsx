import React, { useEffect } from "react";
import { getApplictionTextDrafts } from "src/utils/draftHelper";
import Application, { ApplicationProps } from "./Application";

const GroupApplication = (props: ApplicationProps) => {
  // useEffect(() => {
  //   initializeValue();
  // }, []);
  // const initializeValue = () => {
  //   const groupName = props.group.name.toLowerCase();

  //   const restoredApplicationText = getApplictionTextDrafts();

  //   if (restoredApplicationText != null && restoredApplicationText[groupName]) {
  //     props.form.setFieldValue(groupName, restoredApplicationText[groupName]);
  //   }
  // };

  return <Application {...props} />;
};

export default GroupApplication;
