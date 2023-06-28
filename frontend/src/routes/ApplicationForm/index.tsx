import React, { useMemo } from "react";
import { Formik, FormikValues } from "formik";
import * as Yup from "yup";
import {
  MutationApplication,
  useCreateApplicationMutation,
} from "src/query/mutations";

import GroupApplication from "src/containers/GroupApplication";

import FormStructure from "./FormStructure";
import {
  Admission,
  Application,
  Group,
  JsonFieldEditableInput,
  JsonFieldInput,
} from "src/types";
import { validationFields } from "src/utils/jsonFieldHelper";

interface FormContainerProps extends FormikValues {
  toggleIsEditing: () => void;
}

// State of the form
const FormContainer: React.FC<FormContainerProps> = ({
  admission,
  isSubmitting,
  groups,
  selectedGroups,
  handleSubmit,
  isValid,
  toggleGroup,
  toggleIsEditing,
  myApplication,
}) => {
  const onCancelEdit = () => {
    toggleIsEditing();
  };

  const hasSelected =
    groups.filter((group: Group) => selectedGroups[group.name.toLowerCase()])
      .length >= 1;
  const SelectedGroupItems = groups
    .filter((group: Group) => selectedGroups[group.name.toLowerCase()])
    .map((group: Group) => <GroupApplication key={group.pk} group={group} />);

  // This is where the actual form structure comes in.
  return (
    <FormStructure
      {...{
        admission,
        isSubmitting,
        isValid,
        handleSubmit,
        groups,
        selectedGroups,
        toggleGroup,
        toggleIsEditing,
        myApplication,
      }}
      hasSelected={hasSelected}
      SelectedGroupItems={SelectedGroupItems}
      onCancel={onCancelEdit}
    />
  );
};

interface ApplicationFormProps {
  myApplication?: Application;
  selectedGroups: { [key: string]: boolean };
  toggleGroup: (groupName: string) => void;
  toggleIsEditing: () => void;
  admission?: Admission;
  groups: Group[];
}

// Highest order component for application form.
// Handles form values, submit post and form validation.
const ApplicationForm: React.FC<ApplicationFormProps> = ({
  myApplication,
  selectedGroups,
  toggleGroup,
  toggleIsEditing,
  admission,
  groups,
}) => {
  const createApplicationMutation = useCreateApplicationMutation(
    admission?.slug ?? ""
  );

  const reduceArray: <T extends object>(
    array: T[],
    keyIndex: string,
    reduction: (currentValue: T) => any
  ) => Record<string, T> = (array, keyIndex, reduction) =>
    array
      .filter((value) => keyIndex in value)
      .reduce((accumulator, currentValue) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        accumulator[currentValue[keyIndex]] = reduction(currentValue);
        return accumulator;
      }, {});

  const generateInitValues = (
    questions: JsonFieldInput[]
  ): Record<string, string | Record<string, string>> =>
    reduceArray<JsonFieldInput>(questions, "id", () => "");

  const submittedGroupResponses = myApplication?.group_applications?.reduce(
    (accumulator, currentValue) => ({
      ...accumulator,
      [currentValue.group.name]: currentValue.responses,
    }),
    {}
  );

  const initialValues: FormikValues = useMemo(
    () => ({
      responses:
        myApplication?.responses ??
        generateInitValues(admission?.questions ?? []),
      groupResponses:
        submittedGroupResponses ??
        reduceArray<Group>(admission?.groups ?? [], "name", (group) =>
          generateInitValues(group.questions)
        ),
    }),
    [admission]
  );

  const generateValidationSchema = (questions: JsonFieldInput[]) => {
    const qs = questions
      .filter((question) => "id" in question)
      .reduce<
        Record<string, Yup.StringSchema<string, Yup.AnyObject, undefined, "">>
      >((accumulator, _currentValue) => {
        const currentValue = _currentValue as JsonFieldEditableInput;
        const updatedValidationSchema = { ...accumulator };
        updatedValidationSchema[currentValue.id] =
          validationFields[currentValue.type];
        return updatedValidationSchema;
      }, {});
    return Yup.object(qs);
  };

  return (
    <Formik
      initialValues={initialValues}
      validateOnChange={true}
      enableReinitialize={true}
      validationSchema={() => {
        return Yup.lazy(() => {
          if (!admission) return Yup.object().shape({});
          // Iterate over all selected groups and add them to the required schema
          const groupSchema: Yup.AnyObject = {};
          Object.entries(selectedGroups)
            .filter(([, isSelected]) => isSelected)
            .map(([name]) => name)
            .forEach((name) => {
              const group = groups.find(
                (group) => group.name.toLowerCase() === name
              );
              if (group) {
                groupSchema[group.name] = generateValidationSchema(
                  group.questions
                );
              }
            });
          const schema: Yup.AnyObject = {
            responses: generateValidationSchema(admission?.questions),
            groupResponses: Yup.object(groupSchema),
          };
          return Yup.object().shape(schema);
        });
      }}
      onSubmit={(values, { setSubmitting, setErrors }) => {
        const submission: MutationApplication = {
          responses: values.responses,
          group_applications: {},
        };
        Object.keys(values.groupResponses)
          .filter((groupName) => selectedGroups[groupName.toLowerCase()])
          .forEach((groupName) => {
            submission.group_applications[groupName] =
              values.groupResponses[groupName];
          });
        createApplicationMutation.mutate(
          { newApplication: submission },
          {
            onSuccess: () => {
              setSubmitting(false);
              toggleIsEditing();
            },
            onError: (error) => {
              setErrors(error.response?.data ?? {});
              setSubmitting(false);
            },
          }
        );
      }}
    >
      {
        (formikProps) => (
          <FormContainer
            {...formikProps}
            admission={admission}
            groups={groups}
            selectedGroups={selectedGroups}
            toggleGroup={toggleGroup}
            toggleIsEditing={toggleIsEditing}
            myApplication={myApplication}
          />
        )

        // https://formik.org/docs/api/formik#props-1
      }
    </Formik>
  );
};

export default ApplicationForm;
