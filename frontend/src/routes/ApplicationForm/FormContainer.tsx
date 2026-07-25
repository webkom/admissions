import React from "react";
import { FormikTouched, FormikErrors, Field } from "formik";
import GroupApplication from "src/containers/GroupApplication";
import JsonFieldEditor from "src/components/JsonFieldEditor";
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
    .map((group: Group, index: number) => {
      const groupName = group.name.toLowerCase();
      return (
        <React.Fragment key={`${groupName} ${index}`}>
          <Field
            component={GroupApplication}
            group={group}
            name={"groups." + groupName}
            responseLabel={group.response_label}
            error={
              touched.groups &&
              touched.groups[groupName] &&
              errors.groups &&
              errors.groups[groupName]
            }
          />
          <JsonFieldEditor
            sectionName={`groupAnswers.${groupName}`}
            fields={group.header_fields}
          />
        </React.Fragment>
      );
    });

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
