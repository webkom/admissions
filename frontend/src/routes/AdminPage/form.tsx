import React, { useState } from "react";
import { Field, Form, Formik, FormikProps } from "formik";
import * as Yup from "yup";

import { useUpdateGroupMutation } from "src/query/mutations";

import TextAreaField from "src/components/TextAreaField";

import CSRFToken from "./csrftoken";
import { EditGroupFormWrapper, FormWrapper, SubmitButton } from "./styles";
import { Group, JsonFieldInput } from "src/types";
import JsonFieldEditor from "src/components/JsonFieldEditor";
import { uuidv4mock } from "src/utils/methods";

const editGroupSchema = Yup.object().shape({
  description: Yup.string()
    .min(30, "Skriv mer enn 30 tegn da!")
    .max(300, "Nå er det nok!")
    .required("Beskrivelsen kan ikke være tom!"),
});

interface FormValues {
  description: string;
  questions: JsonFieldInput[];
}

interface EditGroupFormProps {
  group: Group;
}

const mockedInitialQuestions: JsonFieldInput[] = [
  {
    type: "textarea",
    id: uuidv4mock(),
    name: "Søknadstekst",
    label: "Vi vil gjerne høre mer om hva du liker å gjøre ...",
  },
];

const EditGroupForm: React.FC<EditGroupFormProps> = ({ group }) => {
  const [resetMutationTimeout, setResetMutationTimeout] =
    useState<NodeJS.Timeout>();

  const updateGroupMutation = useUpdateGroupMutation();

  return (
    <Formik
      initialValues={{
        description: group.description,
        questions:
          group.questions && Array.isArray(group.questions)
            ? group.questions
            : mockedInitialQuestions,
      }}
      validationSchema={editGroupSchema}
      enableReinitialize={true}
      onSubmit={(values, { setErrors }) => {
        const updatedGroupData = values;

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
              setErrors({
                description: error.response?.data.description[0],
                questions: error.response?.data.questions,
              });
            },
          }
        );
      }}
    >
      {
        (formikProps) => (
          <InnerForm
            {...formikProps}
            group={group}
            updateGroupMutation={updateGroupMutation}
          />
        ) // props reference: https://formik.org/docs/api/formik#props-1
      }
    </Formik>
  );
};

type InnerFormProps = {
  group: Group;
  updateGroupMutation: ReturnType<typeof useUpdateGroupMutation>;
} & FormikProps<FormValues>;

const InnerForm: React.FC<InnerFormProps> = ({
  group,
  updateGroupMutation,
  submitForm,
  isValid,
  values,
}) => {
  return (
    <Form>
      <FormWrapper>
        <CSRFToken />
        <EditGroupFormWrapper>
          <Field
            component={TextAreaField}
            title="Endre beskrivelsen av gruppen"
            name="description"
            label="Beskrivelse av gruppen"
            placeholder="Skriv en beskrivelse av gruppen..."
          />
        </EditGroupFormWrapper>
        <JsonFieldEditor group={group} initialFields={values.questions} />
        <SubmitButton
          onClick={submitForm}
          type="submit"
          disabled={updateGroupMutation.isLoading}
          valid={isValid}
        >
          Lagre
        </SubmitButton>
        {updateGroupMutation.isSuccess && <p>Lagret!</p>}
      </FormWrapper>
    </Form>
  );
};

export default EditGroupForm;
