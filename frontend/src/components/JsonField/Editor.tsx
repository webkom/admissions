import React, { useEffect } from "react";
import { useFormik } from "formik";
import { FieldModel } from "src/utils/jsonFields";
import { styled } from "styled-components";
import { PhoneInputEditorField, TextEditorField } from "./EditorFields";
import { Admission } from "src/types";
import { Button } from "@webkom/lego-bricks";

const defaultFormValues: { [key: string]: FieldModel } = {
  text: { type: "text", text: "Skriv det du vil her" },
  phoneinput: {
    type: "phoneinput",
    id: "sdfsd",
    title: "Telefonnummer",
    label: "Skriv inn telefonnummeret ditt her",
    placeholder: "12345678",
    required: true,
  },
};

type Props = {
  admission: Admission;
  fields: FieldModel[];
  setFields: (fields: FieldModel[]) => void;
};

const JsonFieldEditor: React.FC<Props> = ({ admission, fields, setFields }) => {
  const formik = useFormik({
    initialValues: {
      fields,
    },
    onSubmit: (values) => {
      // TODO Submit the fields to the backend
    },
  });

  useEffect(() => {
    setFields(formik.values.fields);
  }, [formik.values.fields]);

  const addField = (fieldValue: FieldModel) =>
    formik.setFieldValue("fields", [...formik.values.fields, fieldValue]);

  const updateField = (fieldValue: FieldModel, index: number) => {
    const updatedFields = [...formik.values.fields];
    updatedFields[index] = fieldValue;
    formik.setFieldValue("fields", updatedFields);
  };

  const removeField = (index: number) => {
    const updatedFields = [...formik.values.fields];
    updatedFields.splice(index, 1);
    formik.setFieldValue("fields", updatedFields);
  };

  return (
    <form onSubmit={formik.handleSubmit}>
      {formik.values.fields.length === 0 && (
        <p>Dette opptaket har ingen ekstra tekst eller spørsmål.</p>
      )}
      {formik.values.fields
        .map((field, index) =>
          field.type === "text" ? (
            <TextEditorField
              key={index + field.type}
              field={field}
              updateField={(field) => updateField(field, index)}
            />
          ) : field.type === "phoneinput" ? (
            <PhoneInputEditorField
              key={field.id}
              field={field}
              updateField={(field) => updateField(field, index)}
            />
          ) : null,
        )
        .map((field, index) => (
          <>
            {field}
            <Button onClick={() => removeField(index)}>Slett feltet</Button>
          </>
        ))}
      <ButtonGroup>
        <Button onClick={() => addField(defaultFormValues.text)}>
          Legg til tekst
        </Button>
        <Button onClick={() => addField(defaultFormValues.phoneinput)}>
          Legg til telefonnummer-input
        </Button>
      </ButtonGroup>
      <Button
        submit
        disabled={
          admission.is_appliable || admission.is_closed || admission.is_closed
        }
      >
        Lagre
      </Button>
    </form>
  );
};

export default JsonFieldEditor;

const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
  margin: 1rem 0;
`;
