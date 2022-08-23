import React from "react";
import { withFormik, Field } from "formik";
import * as Yup from "yup";
import callApi from "src/utils/callApi";

import GroupApplication from "src/containers/GroupApplication";

import FormStructure from "./FormStructure";

// State of the form
const FormContainer = ({
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
  isEditingApplication,
  handleReset,
}) => {
  const onCancelEdit = () => {
    toggleIsEditing();
    handleReset();
  };

  const hasSelected =
    groups.filter((group) => selectedGroups[group.name.toLowerCase()]).length >=
    1;
  const SelectedGroupItems = groups
    .filter((group) => selectedGroups[group.name.toLowerCase()])
    .map((group, index) => (
      <Field
        component={GroupApplication}
        group={group}
        name={group.name.toLowerCase()}
        responseLabel={group.response_label}
        error={
          touched[group.name.toLowerCase()] && errors[group.name.toLowerCase()]
        }
        key={`${group.name.toLowerCase()} ${index}`}
        disabled={!isEditingApplication}
      />
    ));

  // This is where the actual form structure comes in.
  return (
    <FormStructure
      admission={admission}
      hasSelected={hasSelected}
      SelectedGroupItems={SelectedGroupItems}
      isSubmitting={isSubmitting}
      isValid={isValid}
      handleSubmit={handleSubmit}
      groups={groups}
      selectedGroups={selectedGroups}
      toggleGroup={toggleGroup}
      toggleIsEditing={toggleIsEditing}
      isEditing={isEditingApplication}
      myApplication={myApplication}
      onCancel={onCancelEdit}
    />
  );
};

// Highest order component for application form.
// Handles form values, submit post and form validation.
const ApplicationForm = withFormik({
  mapPropsToValues({ myApplication = {}, selectedGroups = {} }) {
    const {
      text = sessionStorage.getItem("text") || "",
      phone_number = sessionStorage.getItem("phoneNumber") || "",
      group_applications = [],
    } = myApplication;

    const blankGroupApplications = {};
    Object.keys(selectedGroups).forEach((group) => {
      blankGroupApplications[group] = "";
    });

    const groupApplications = group_applications.reduce(
      (obj, application) => ({
        ...obj,
        [application.group.name.toLowerCase()]: application.text,
      }),
      {}
    );

    return {
      priorityText: text,
      phoneNumber: phone_number,
      ...blankGroupApplications,
      ...groupApplications,
    };
  },
  handleSubmit(
    values,
    { props: { selectedGroups, toggleIsEditing }, setSubmitting }
  ) {
    const submission = {
      text: values.priorityText,
      applications: {},
      phone_number: values.phoneNumber,
    };
    Object.keys(values)
      .filter((group) => selectedGroups[group])
      .forEach((name) => {
        submission.applications[name] = values[name];
      });
    return callApi("/application/", {
      method: "POST",
      body: JSON.stringify(submission),
    })
      .then(() => {
        setSubmitting(false);
        toggleIsEditing();
        window.__DJANGO__.user.has_application = true;
      })
      .catch((err) => {
        alert("Det skjedde en feil.... ");
        setSubmitting(false);
        throw err;
      });
  },

  validationSchema: (props) => {
    return Yup.lazy((values) => {
      const selectedGroups = Object.keys(values).filter(
        (group) => props.selectedGroups[group]
      );
      const schema = {};
      selectedGroups.forEach((name) => {
        schema[name] = Yup.string().required("Søknadsteksten må fylles ut");
      });
      schema.phoneNumber = Yup.string("Skriv inn et norsk telefonnummer")
        .matches(
          /^(0047|\+47|47)?(?:\s*\d){8}$/,
          "Skriv inn et gyldig norsk telefonnummer"
        )
        .required("Skriv inn et gyldig norsk telefonnummer");
      return Yup.object().shape(schema);
    });
  },
  displayName: "ApplicationForm",
  validateOnChange: true,
  enableReinitialize: true,
})(FormContainer);

export default ApplicationForm;
