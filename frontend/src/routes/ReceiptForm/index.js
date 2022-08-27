import React from "react";
import { Formik } from "formik";
import { useMyApplication } from "src/query/hooks";

import FormStructure from "./FormStructure";

// State of the form
const FormContainer = ({ toggleIsEditing }) => {
  // This is where the actual form structure comes in.
  return <FormStructure toggleIsEditing={toggleIsEditing} />;
};

// Highest order component for application form.
// Handles form values, submit post and form validation.
const ApplicationForm = ({ toggleIsEditing }) => {
  const { data: myApplication, isFetching } = useMyApplication();

  if (isFetching) return <p>Loading</p>;

  const { phone_number, text, group_applications } = myApplication;

  console.log(myApplication);

  const groupApplications = group_applications.reduce(
    (obj, application) => ({
      ...obj,
      [application.group.name.toLowerCase()]: application.text,
    }),
    {}
  );

  const initialValues = {
    priorityText: text,
    phoneNumber: phone_number,
    ...groupApplications,
  };

  return (
    <Formik initialValues={initialValues}>
      <FormContainer toggleIsEditing={toggleIsEditing} />
    </Formik>
  );
};

export default ApplicationForm;
