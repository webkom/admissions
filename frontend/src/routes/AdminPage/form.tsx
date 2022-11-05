import React, { useState } from "react";
import { Field, Form, Formik, FormikProps } from "formik";
import * as Yup from "yup";

import { useUpdateGroupMutation } from "src/query/mutations";

import TextAreaField from "src/components/TextAreaField";

import CSRFToken from "./csrftoken";
import { EditGroupFormWrapper, FormWrapper, SubmitButton } from "./styles";
import { Group } from "src/types";

const signupSchema = Yup.object().shape({
  description: Yup.string()
    .min(30, "Skriv mer enn 30 tegn da!")
    .max(300, "Nå er det nok!")
    .required("Beskrivelsen kan ikke være tom!"),
  response_label: Yup.string()
    .min(30, "Skriv mer enn 30 tegn da!")
    .max(300, "Nå er det nok!")
    .required("Boksen kan ikke være tom!"),
});

interface FormValues {
  description: string;
  response_label: string;
}

interface EditGroupFormProps {
  group: Group;
  initialDescription: string;
  initialReplyText: string;
}

const EditGroupForm: React.FC<EditGroupFormProps> = ({
  group,
  initialDescription,
  initialReplyText,
}) => {
  const [resetMutationTimeout, setResetMutationTimeout] =
    useState<NodeJS.Timeout>();

  const updateGroupMutation = useUpdateGroupMutation();

  return (
    <Formik
      initialValues={{
        description: initialDescription,
        response_label: initialReplyText,
      }}
      validationSchema={signupSchema}
      enableReinitialize={true}
      onSubmit={(values, { setErrors }) => {
        const updatedGroupData = {
          description: values.description,
          response_label: values.response_label,
        };

        clearTimeout(resetMutationTimeout);

        updateGroupMutation.mutate(
          { groupPrimaryKey: group.pk, updatedGroupData },
          {
            onSuccess: () => {
              setResetMutationTimeout(
                setTimeout(() => {
                  updateGroupMutation.reset();
                }, 1200)
              );
            },
            onError: (error) => {
              const errors: { [key: string]: string } = {};
              Object.keys(error).forEach((key) => {
                errors[key] = error[key][0];
              });
              setErrors(errors);
            },
          }
        );
      }}
    >
      {
        (formikProps) => (
          <InnerForm
            {...formikProps}
            updateGroupMutation={updateGroupMutation}
          />
        ) // props reference: https://formik.org/docs/api/formik#props-1
      }
    </Formik>
  );
};

type InnerFormProps = {
  updateGroupMutation: ReturnType<typeof useUpdateGroupMutation>;
} & FormikProps<FormValues>;

const InnerForm: React.FC<InnerFormProps> = ({
  updateGroupMutation,
  submitForm,
  isValid,
}) => {
  return (
    <Form>
      <FormWrapper>
        <CSRFToken />
        <EditGroupFormWrapper>
          <Field
            component={TextAreaField}
            title="Endre beskrivelsen av komiteen"
            name="description"
            placeholder="Skriv en beskrivelse av komiteen..."
          />
          <Field
            component={TextAreaField}
            title="Endre hva komitteen ønsker å høre om fra søkere"
            name="response_label"
            placeholder="Skriv hva komitteen ønsker å vite om søkeren..."
          />
        </EditGroupFormWrapper>
        <SubmitButton
          onClick={submitForm}
          type="submit"
          disabled={updateGroupMutation.isLoading}
          valid={isValid}
        >
          Submit
        </SubmitButton>
        {updateGroupMutation.isSuccess && <p>Lagret!</p>}
      </FormWrapper>
    </Form>
  );
};

export default EditGroupForm;
