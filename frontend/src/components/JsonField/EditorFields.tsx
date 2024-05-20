import { PhoneInputModel, TextModel } from "src/utils/jsonFields";
import { styled } from "styled-components";
import { StyledInput, StyledTextAreaField } from "../styledFields";

export const TextEditorField = ({
  field,
  updateField,
}: {
  field: TextModel;
  updateField: (field: TextModel) => void;
}) => (
  <div>
    <FieldTitle>Informasjonstekst</FieldTitle>
    <StyledTextAreaField
      value={field.text}
      onChange={(e) => updateField({ ...field, text: e.target.value })}
    />
  </div>
);

export const PhoneInputEditorField = ({
  field,
  updateField,
}: {
  field: PhoneInputModel;
  updateField: (field: PhoneInputModel) => void;
}) => (
  <div>
    <FieldTitle>Telefonnummer</FieldTitle>
    <FieldDescription>
      Et input-felt som valideres som et norsk telefonnummer
    </FieldDescription>
    <Label>
      <span>Tittel</span>
      <StyledInput
        value={field.title}
        onChange={(e) => updateField({ ...field, title: e.target.value })}
      />
    </Label>
    <Label>
      <span>Hjelpetekst</span>
      <StyledInput
        value={field.label}
        onChange={(e) => updateField({ ...field, label: e.target.value })}
      />
    </Label>
    <Label>
      <span>Placeholder</span>
      <StyledInput
        value={field.placeholder}
        onChange={(e) => updateField({ ...field, placeholder: e.target.value })}
      />
    </Label>
    <Label>
      <span>Obligatorisk felt</span>
      <input
        type="checkbox"
        defaultChecked={field.required}
        onChange={(e) =>
          updateField({ ...field, required: !!e.target.checked })
        }
      />
    </Label>
  </div>
);

const FieldTitle = styled.p`
  margin: 0;
  font-weight: 600;
  margin-top: 1rem;
`;

const FieldDescription = styled.span`
  display: block;
  margin-bottom: 0.5rem;
`;

const Label = styled.label`
  display: flex;
  gap: 1rem;
`;
