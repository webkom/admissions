import React from "react";
import { Formik } from "formik";
import { useMyApplication } from "src/query/hooks";

import FormStructure from "./FormStructure";
import { useParams } from "react-router-dom";

interface FormProps {
  toggleIsEditing: () => void;
}

const ReceiptForm: React.FC<FormProps> = ({ toggleIsEditing }) => {
  const { admissionSlug } = useParams();
  const { data: myApplication, isFetching } = useMyApplication(
    admissionSlug ?? ""
  );

  if (isFetching) return <p>Loading</p>;

  const { responses, group_applications } = myApplication ?? {};

  const groupResponses = group_applications?.reduce(
    (accumulator, currentValue) => ({
      ...accumulator,
      [currentValue.group.name]: currentValue.responses,
    }),
    {}
  );

  const initialValues = {
    responses: responses,
    groupResponses: groupResponses,
  };

  return (
    <Formik initialValues={initialValues} onSubmit={() => undefined}>
      <FormStructure toggleIsEditing={toggleIsEditing} />
    </Formik>
  );
};

export default ReceiptForm;
