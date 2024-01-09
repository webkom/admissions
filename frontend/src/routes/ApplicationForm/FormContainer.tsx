import React from "react";
import { FormikTouched, FormikErrors, Field } from "formik";
import GroupApplication from "src/containers/GroupApplication";
import { Group } from "src/types";
import { FormValues, SharedApplicationProps } from ".";
import FormStructure from "./FormStructure";

type FormContainerProps = SharedApplicationProps & {
  handleSubmit: () => void;
  touched: FormikTouched<FormValues>;
  errors: FormikErrors<FormValues>;
  isSubmitting: boolean;
  isValid: boolean;
};

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
          touched.groups &&
          touched.groups[group.name.toLowerCase()] &&
          errors.groups &&
          errors.groups[group.name.toLowerCase()]
        }
        key={`${group.name.toLowerCase()} ${index}`}
      />
    ));

  return (
    <FormStructure
      admission={admission}
      isSubmitting={isSubmitting}
      isValid={isValid}
      handleSubmit={handleSubmit}
      groups={groups}
      selectedGroups={selectedGroups}
      toggleGroup={toggleGroup}
      toggleIsEditing={toggleIsEditing}
      myApplication={myApplication}
      hasSelected={hasSelected}
      SelectedGroupItems={SelectedGroupItems}
      onCancel={onCancelEdit}
    />
  );
};

export default FormContainer;
