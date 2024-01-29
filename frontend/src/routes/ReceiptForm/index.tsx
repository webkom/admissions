import React from "react";
import { Formik } from "formik";
import { useMyApplication } from "src/query/hooks";

import FormStructure from "./FormStructure";
import { useParams } from "react-router-dom";
import { FormValues } from "../ApplicationForm";

interface FormProps {
  toggleIsEditing: () => void;
}

// Highest order component for application form.
// Handles form values, submit post and form validation.
const ApplicationForm: React.FC<FormProps> = ({ toggleIsEditing }) => {
  const { admissionSlug } = useParams();
  const { data: myApplication, isFetching } = useMyApplication(
    admissionSlug ?? ""
  );

  if (isFetching) return <p>Loading</p>;

  if (!myApplication) {
    return <p>Feil: klarte ikke hente søknaden din.</p>;
  }

  const { phone_number, text, group_applications } = myApplication ?? {};

  const groupApplications = group_applications?.reduce(
    (obj, application) => ({
      ...obj,
      [application.group.name.toLowerCase()]: application.text,
    }),
    {}
  );

  const initialValues: FormValues = {
    priorityText: text ?? "",
    phoneNumber: phone_number,
    headerFields: myApplication?.header_fields_response,
    groups: groupApplications,
  };

  return (
    <Formik<FormValues>
      initialValues={initialValues}
      onSubmit={() => undefined}
    >
      <FormStructure toggleIsEditing={toggleIsEditing} />
    </Formik>
  );
};

export default ApplicationForm;
