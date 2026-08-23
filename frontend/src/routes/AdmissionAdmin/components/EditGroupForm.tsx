import React, { useState } from "react";
import { Field, Form, Formik, FormikProps } from "formik";
import * as Yup from "yup";

import { useAdminUpdateGroupMutation } from "src/query/mutations";

import TextAreaField from "src/components/TextAreaField";

import CSRFToken from "./csrftoken";
import { EditGroupFormWrapper, FormWrapper } from "./styles";
import { Group } from "src/types";
import { StyledButton } from "src/components/LinkButton";

const signupSchema = Yup.object().shape({
  description: Yup.string()
    .min(30, "Skriv mer enn 30 tegn da!")
    .max(600, "Nå er det nok!")
    .required("Beskrivelsen kan ikke være tom!"),
  response_label: Yup.string()
    .min(30, "Skriv mer enn 30 tegn da!")
    .max(600, "Nå er det nok!")
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

  const updateGroupMutation = useAdminUpdateGroupMutation();

  return (
    <Formik
      initialValues={{
        description: initialDescription,
        response_label: initialReplyText,
      }}
      validationSchema={signupSchema}
      enableReinitialize={true}
      initialTouched={{
        description: true,
        response_label: true,
      }}
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
                }, 1200),
              );
            },
            onError: (error) => {
              const data = (error.response?.data ?? {}) as Record<
                string,
                string[] | undefined
              >;
              setErrors({
                description:
                  data.description?.[0] ??
                  "Kunne ikke lagre. Prøv igjen senere.",
                response_label: data.response_label?.[0],
              });
            },
          },
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
  updateGroupMutation: ReturnType<typeof useAdminUpdateGroupMutation>;
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
            title="Endre beskrivelsen av gruppa*"
            name="description"
            placeholder="Skriv en beskrivelse av gruppa..."
          />
          <Field
            component={TextAreaField}
            title="Endre hva gruppa ønsker å høre om fra søkere*"
            name="response_label"
            placeholder="Skriv hva gruppa ønsker å vite om søkeren..."
          />
        </EditGroupFormWrapper>
        <StyledButton
          submit
          onClick={submitForm}
          disabled={!isValid || updateGroupMutation.isPending}
        >
          Lagre
        </StyledButton>
        {updateGroupMutation.isSuccess && <p>Lagret!</p>}
      </FormWrapper>
    </Form>
  );
};

export default EditGroupForm;
