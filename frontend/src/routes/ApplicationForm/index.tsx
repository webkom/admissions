import React from "react";
import { Formik, FormikHelpers } from "formik";
import * as Yup from "yup";
import {
  MutationApplication,
  useCreateApplicationMutation,
} from "src/query/mutations";

import {
  getApplictionTextDrafts,
  getPhoneNumberDraft,
  getPriorityTextDraft,
} from "src/utils/draftHelper";
import { Admission, Application, Group } from "src/types";
import FormContainer from "./FormContainer";
import { InputFieldModel, InputResponseModel } from "src/utils/jsonFields";

export type SelectedGroups = { [key: string]: boolean };

export type FormValues = {
  priorityText: string;
  phoneNumber: string;
  headerFields: InputResponseModel;
  groups: { [groupName: string]: string };
};

export type SharedApplicationProps = {
  toggleIsEditing: () => void;
  myApplication?: Application;
  selectedGroups: SelectedGroups;
  toggleGroup: (groupName: string) => void;
  admission?: Admission;
  groups: Group[];
};

const generateInitialValues: (
  selectedGroups: SelectedGroups,
  admission?: Admission,
  myApplication?: Application,
) => FormValues = (selectedGroups, admission, myApplication) => {
  const {
    text = getPriorityTextDraft(),
    phone_number: phoneNumber = getPhoneNumberDraft(),
    group_applications: groupApplications = getApplictionTextDrafts(),
  } = myApplication || {};

  const initialValues: FormValues = {
    priorityText: text,
    phoneNumber,
    headerFields: {},
    groups: {},
  };

  const formattedGroupApplications: FormValues["groups"] = {};
  Object.keys(selectedGroups).forEach((group) => {
    formattedGroupApplications[group] = "";
  });

  const blankHeaderFields = (admission?.header_fields as InputFieldModel[])
    .filter((field) => "id" in field)
    .reduce(
      (obj, field) => ({
        ...obj,
        [field.id]:
          (myApplication?.header_fields_response &&
            myApplication?.header_fields_response[field.id]) ??
          "",
      }),
      {},
    );
  initialValues.headerFields = blankHeaderFields;

  // The group applications are already formatted in the object form Formik likes
  if (!Array.isArray(groupApplications)) {
    initialValues.groups = {
      ...formattedGroupApplications,
      ...groupApplications,
    };
    return initialValues;
  }

  // The group applications are formatted in the array that Django/Postgres likes
  groupApplications.forEach((application) => {
    formattedGroupApplications[application.group.name.toLowerCase()] =
      application.text;
  });

  initialValues.groups = formattedGroupApplications;
  return initialValues;
};

const validationSchema = (
  selectedGroups: SelectedGroups,
  admission?: Admission,
) => {
  return Yup.lazy(() => {
    // Iterate over all selected groups and add them to the required schema
    const selectedGroupsSchema: { [x: string]: Yup.StringSchema } = {};
    Object.entries(selectedGroups)
      .filter(
        ([groupName, isSelected]) =>
          isSelected &&
          admission?.groups.some((group) => group.name === groupName),
      )
      .forEach(
        ([groupName]) =>
          (selectedGroupsSchema[groupName] = Yup.string().required(
            "Søknadsteksten må fylles ut",
          )),
      );

    const headerFieldsSchema = (admission?.header_fields as InputFieldModel[])
      .filter((field) => "id" in field && field.required)
      .reduce(
        (obj, field) => ({
          ...obj,
          [field.id]: Yup.string().required(`${field.title} må fylles ut`),
        }),
        {},
      );

    return Yup.object().shape({
      phoneNumber: Yup.string()
        .matches(
          /^(0047|\+47|47)?(?:\s*\d){8}$/,
          "Skriv inn et gyldig norsk telefonnummer",
        )
        .required("Skriv inn et gyldig norsk telefonnummer"),
      priorityText: Yup.string().optional(),
      headerFields: Yup.object().shape(headerFieldsSchema),
      groups: Yup.object().shape(selectedGroupsSchema),
    });
  });
};

type ApplicationFormProps = SharedApplicationProps;

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
    admission?.slug ?? "",
  );

  const onSubmit: (
    values: FormValues,
    formikHelpers: FormikHelpers<FormValues>,
  ) => void = (values, { setSubmitting }) => {
    const submission: MutationApplication = {
      text: values.priorityText,
      applications: {},
      phone_number: values.phoneNumber,
      header_fields_response: values.headerFields,
    };
    Object.keys(values.groups)
      .filter(
        (groupName) =>
          selectedGroups[groupName] &&
          admission?.groups.some((group) => group.name === groupName),
      )
      .forEach((name) => {
        submission.applications[name] = values.groups[name];
      });
    createApplicationMutation.mutate(
      { newApplication: submission },
      {
        onSuccess: () => {
          setSubmitting(false);
          toggleIsEditing();
        },
        onError: () => {
          alert("Det skjedde en feil.... ");
          setSubmitting(false);
        },
      },
    );
  };

  return (
    <Formik<FormValues>
      initialValues={generateInitialValues(
        selectedGroups,
        admission,
        myApplication,
      )}
      validateOnChange={true}
      enableReinitialize={true}
      validationSchema={validationSchema(selectedGroups, admission)}
      onSubmit={onSubmit}
    >
      {
        (formikProps) => (
          <FormContainer
            admission={admission}
            groups={groups}
            selectedGroups={selectedGroups}
            toggleGroup={toggleGroup}
            toggleIsEditing={toggleIsEditing}
            myApplication={myApplication}
            handleSubmit={formikProps.handleSubmit}
            touched={formikProps.touched}
            errors={formikProps.errors}
            isSubmitting={formikProps.isSubmitting}
            isValid={formikProps.isValid}
          />
        )
        // https://formik.org/docs/api/formik#props-1
      }
    </Formik>
  );
};

export default ApplicationForm;
