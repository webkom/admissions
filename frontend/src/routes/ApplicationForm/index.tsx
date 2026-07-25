import React from "react";
import { Formik, FormikHelpers } from "formik";
import * as Yup from "yup";
import {
  MutationApplication,
  useCreateApplicationMutation,
} from "src/query/mutations";
import { isSensitiveAuthorityChangedError } from "src/query/sensitiveAccess";

import {
  getApplictionTextDrafts,
  clearAllDrafts,
  getSavedPhoneNumber,
  getPhoneNumberDraft,
  getPriorityTextDraft,
  saveSubmittedPhoneNumber,
} from "src/utils/draftHelper";
import { Admission, Application, Group } from "src/types";
import FormContainer from "./FormContainer";
import { InputFieldModel, InputResponseModel } from "src/utils/jsonFields";
import djangoData from "src/utils/djangoData";

export type SelectedGroups = { [key: string]: boolean };

export type FormValues = {
  phoneNumber: string;
  priorityText: string;
  groupAnswers: Record<string, InputResponseModel>;
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
  userId: string,
  admission?: Admission,
  myApplication?: Application,
) => FormValues = (selectedGroups, userId, admission, myApplication) => {
  const savedPhoneNumber = getSavedPhoneNumber(userId);
  const {
    phone_number: phoneNumber = getPhoneNumberDraft(savedPhoneNumber),
    priority_text: priorityText = getPriorityTextDraft(),
    group_applications: groupApplications = getApplictionTextDrafts(),
  } = myApplication || {};

  const initialValues: FormValues = {
    phoneNumber,
    priorityText,
    groupAnswers: {},
    groups: {},
  };

  const formattedGroupApplications: FormValues["groups"] = {};
  Object.keys(selectedGroups).forEach((group) => {
    formattedGroupApplications[group] = "";
  });

  const blankGroupAnswers = (group: Group): InputResponseModel =>
    (group.header_fields ?? [])
      .filter((field): field is InputFieldModel => "id" in field)
      .reduce(
        (answers, field) => ({
          ...answers,
          [field.id]: field.type === "checkbox" ? false : "",
        }),
        {},
      );
  initialValues.groupAnswers = Object.fromEntries(
    (admission?.groups ?? [])
      .filter((group) => selectedGroups[group.name.toLowerCase()])
      .map((group) => [group.name.toLowerCase(), blankGroupAnswers(group)]),
  );

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
    const groupName = application.group.name.toLowerCase();
    formattedGroupApplications[groupName] = application.text;
    initialValues.groupAnswers[groupName] =
      application.header_fields_response ?? {};
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
          admission?.groups.some(
            (group) => group.name.toLowerCase() === groupName,
          ),
      )
      .forEach(
        ([groupName]) =>
          (selectedGroupsSchema[groupName] = Yup.string().required(
            "Søknadsteksten må fylles ut",
          )),
      );

    const groupAnswersSchema = Object.fromEntries(
      (admission?.groups ?? [])
        .filter((group) => selectedGroups[group.name.toLowerCase()])
        .map((group) => {
          const requiredFields = (group.header_fields ?? [])
            .filter(
              (field): field is InputFieldModel =>
                "id" in field && field.required,
            )
            .reduce(
              (fields, field) => {
                fields[field.id] =
                  field.type === "checkbox"
                    ? Yup.boolean().oneOf(
                        [true],
                        `${field.title} må krysses av`,
                      )
                    : Yup.string().required(`${field.title} må fylles ut`);
                return fields;
              },
              {} as Record<string, Yup.BooleanSchema | Yup.StringSchema>,
            );
          return [group.name.toLowerCase(), Yup.object().shape(requiredFields)];
        }),
    );

    return Yup.object().shape({
      phoneNumber: Yup.string()
        .matches(
          /^(0047|\+47|47)?(?:\s*\d){8}$/,
          "Skriv inn et gyldig norsk telefonnummer",
        )
        .required("Skriv inn et gyldig norsk telefonnummer"),
      priorityText: Yup.string().max(
        5000,
        "Prioriteringer kan ikke være lengre enn 5000 tegn",
      ),
      groupAnswers: Yup.object().shape(groupAnswersSchema),
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
  const currentUserId = djangoData.user.id ?? "";

  const onSubmit: (
    values: FormValues,
    formikHelpers: FormikHelpers<FormValues>,
  ) => void = (values, { setSubmitting }) => {
    const submission: MutationApplication = {
      applications: {},
      phone_number: values.phoneNumber,
      priority_text: values.priorityText,
      group_answers: {},
    };
    Object.keys(values.groups)
      .filter(
        (groupName) =>
          selectedGroups[groupName] &&
          admission?.groups.some(
            (group) => group.name.toLowerCase() === groupName,
          ),
      )
      .forEach((name) => {
        submission.applications[name] = values.groups[name];
        submission.group_answers[name] = values.groupAnswers[name] ?? {};
      });
    createApplicationMutation.mutate(
      { newApplication: submission },
      {
        onSuccess: () => {
          saveSubmittedPhoneNumber(currentUserId, values.phoneNumber);
          clearAllDrafts();
          setSubmitting(false);
          toggleIsEditing();
        },
        onError: (error) => {
          setSubmitting(false);
          if (isSensitiveAuthorityChangedError(error)) return;
          alert("Det skjedde en feil.... ");
        },
      },
    );
  };

  return (
    <Formik<FormValues>
      initialValues={generateInitialValues(
        selectedGroups,
        currentUserId,
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
