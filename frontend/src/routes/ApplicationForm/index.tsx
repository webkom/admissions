import React from "react";
import { Formik, Field, FormikValues } from "formik";
import * as Yup from "yup";
import {
  MutationApplication,
  useCreateApplicationMutation,
} from "src/query/mutations";

import GroupApplication from "src/containers/GroupApplication";

import FormStructure from "./FormStructure";
import {
  getPhoneNumberDraft,
  getPriorityTextDraft,
} from "src/utils/draftHelper";
import { Admission, Application, Group } from "src/types";

interface FormContainerProps extends FormikValues {
  toggleIsEditing: () => void;
}

// State of the form
const FormContainer: React.FC<FormContainerProps> = ({
  admission,
  touched,
  errors,
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
    .map((group: Group, index: number) => (
      <Field
        component={GroupApplication}
        group={group}
        name={group.name.toLowerCase()}
        responseLabel={group.response_label}
        error={
          touched[group.name.toLowerCase()] && errors[group.name.toLowerCase()]
        }
        key={`${group.name.toLowerCase()} ${index}`}
      />
    ));

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

interface FormValues extends Record<string, string> {
  priorityText: string;
  phoneNumber: string;
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
    String(admission?.pk)
  );

  const {
    text = getPriorityTextDraft(),
    phone_number: phoneNumber = getPhoneNumberDraft(),
    group_applications: groupApplications = [],
  } = myApplication || {};

  const blankGroupApplications: { [key: string]: string } = {};
  Object.keys(selectedGroups).forEach((group) => {
    blankGroupApplications[group] = "";
  });

  const reformattedGroupApplications = groupApplications.reduce(
    (obj, application) => ({
      ...obj,
      [application.group.name.toLowerCase()]: application.text,
    }),
    {}
  );

  const initialValues: FormValues = {
    priorityText: text,
    phoneNumber,
    ...blankGroupApplications,
    ...reformattedGroupApplications,
  };

  return (
    <Formik
      initialValues={initialValues}
      validateOnChange={true}
      enableReinitialize={true}
      validationSchema={() => {
        return Yup.lazy(() => {
          // Iterate over all selected groups and add them to the required schema
          const schema: {
            [key: string]: Yup.StringSchema<string | undefined>;
          } = {};
          Object.entries(selectedGroups)
            .filter(([, isSelected]) => isSelected)
            .map(([name]) => name)
            .forEach((name) => {
              schema[name] = Yup.string().required(
                "Søknadsteksten må fylles ut"
              );
            });
          // Require phoneNumber with given structure to be set
          schema.phoneNumber = Yup.string()
            .matches(
              /^(0047|\+47|47)?(?:\s*\d){8}$/,
              "Skriv inn et gyldig norsk telefonnummer"
            )
            .required("Skriv inn et gyldig norsk telefonnummer");
          return Yup.object().shape(schema);
        });
      }}
      onSubmit={(values, { setSubmitting }) => {
        const submission: MutationApplication = {
          text: values.priorityText,
          applications: {},
          phone_number: values.phoneNumber,
          admission: admission?.pk,
        };
        Object.keys(values)
          .filter((group) => selectedGroups[group])
          .forEach((name) => {
            submission.applications[name] = values[name];
          });
        createApplicationMutation.mutate(
          { newApplication: submission },
          {
            onSuccess: () => {
              setSubmitting(false);
              toggleIsEditing();
              window.__DJANGO__.user.has_application = true;
            },
            onError: () => {
              alert("Det skjedde en feil.... ");
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
            {...{
              admission,
              groups,
              selectedGroups,
              toggleGroup,
              toggleIsEditing,
              myApplication,
            }}
          />
        )
        // https://formik.org/docs/api/formik#props-1
      }
    </Formik>
  );
};

export default ApplicationForm;
