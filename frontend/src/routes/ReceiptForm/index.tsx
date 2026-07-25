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
    admissionSlug ?? "",
  );

  if (isFetching) return <p>Loading</p>;

  if (!myApplication) {
    return <p>Feil: klarte ikke hente søknaden din.</p>;
  }

  const { phone_number, priority_text, group_applications } =
    myApplication ?? {};

  const groupApplications = group_applications?.reduce(
    (obj, application) => ({
      ...obj,
      [application.group.name.toLowerCase()]: application.text,
    }),
    {},
  );
  const groupAnswers = group_applications?.reduce(
    (answers, application) => ({
      ...answers,
      [application.group.name.toLowerCase()]:
        application.header_fields_response ?? {},
    }),
    {},
  );

  const initialValues: FormValues = {
    phoneNumber: phone_number,
    priorityText: priority_text ?? "",
    groupAnswers,
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
