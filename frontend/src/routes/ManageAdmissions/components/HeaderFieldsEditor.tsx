import React from "react";
import styled from "styled-components";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { FieldModel, InputFieldModel } from "src/utils/jsonFields";

const INPUT_TYPE_OPTIONS: { value: InputFieldModel["type"]; label: string }[] =
  [
    { value: "textinput", label: "Kort tekst" },
    { value: "textarea", label: "Lang tekst" },
    { value: "numberinput", label: "Tall" },
    { value: "phoneinput", label: "Telefon" },
  ];

const makeInputField = (): InputFieldModel => ({
  id: crypto.randomUUID(),
  type: "textinput",
  title: "",
  label: "",
  placeholder: "",
  required: false,
});

type Props = {
  value: FieldModel[];
  onChange: (fields: FieldModel[]) => void;
};

const HeaderFieldsEditor: React.FC<Props> = ({ value, onChange }) => {
  const replaceAt = (index: number, next: FieldModel) =>
    onChange(value.map((field, i) => (i === index ? next : field)));

  const removeAt = (index: number) =>
    onChange(value.filter((_, i) => i !== index));

  const moveBy = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const patchInput = (index: number, patch: Partial<InputFieldModel>) => {
    const field = value[index];
    if (field.type === "text") return;
    replaceAt(index, { ...field, ...patch });
  };

  return (
    <Wrapper>
      {value.length === 0 && <Empty>Ingen ekstra spørsmål er lagt til.</Empty>}

      {value.map((field, index) => (
        <Row key={field.type === "text" ? `text-${index}` : field.id}>
          <RowHeader>
            <RowKind>
              {field.type === "text" ? "Infotekst" : "Spørsmål"}
            </RowKind>
            <RowActions>
              <IconButton
                type="button"
                aria-label="Flytt opp"
                disabled={index === 0}
                onClick={() => moveBy(index, -1)}
              >
                <ArrowUp size={15} />
              </IconButton>
              <IconButton
                type="button"
                aria-label="Flytt ned"
                disabled={index === value.length - 1}
                onClick={() => moveBy(index, 1)}
              >
                <ArrowDown size={15} />
              </IconButton>
              <IconButton
                type="button"
                aria-label="Fjern"
                onClick={() => removeAt(index)}
              >
                <Trash2 size={15} />
              </IconButton>
            </RowActions>
          </RowHeader>

          {field.type === "text" ? (
            <Field>
              <FieldLabel>Tekst som vises til søkeren</FieldLabel>
              <TextArea
                value={field.text}
                onChange={(e) =>
                  replaceAt(index, { type: "text", text: e.target.value })
                }
                placeholder="Skriv en forklarende tekst…"
              />
            </Field>
          ) : (
            <>
              <Grid>
                <Field>
                  <FieldLabel>Type</FieldLabel>
                  <Select
                    value={field.type}
                    onChange={(e) =>
                      patchInput(index, {
                        type: e.target.value as InputFieldModel["type"],
                      })
                    }
                  >
                    {INPUT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Spørsmål (min. 5 tegn)</FieldLabel>
                  <Input
                    value={field.title}
                    onChange={(e) =>
                      patchInput(index, { title: e.target.value })
                    }
                    placeholder="f.eks. Hvilket trinn går du på?"
                  />
                </Field>
                <Field>
                  <FieldLabel>Hjelpetekst</FieldLabel>
                  <Input
                    value={field.label}
                    onChange={(e) =>
                      patchInput(index, { label: e.target.value })
                    }
                    placeholder="Valgfri utdypning"
                  />
                </Field>
                <Field>
                  <FieldLabel>Plassholder</FieldLabel>
                  <Input
                    value={field.placeholder}
                    onChange={(e) =>
                      patchInput(index, { placeholder: e.target.value })
                    }
                    placeholder="Vises i tomt felt"
                  />
                </Field>
              </Grid>
              <RequiredLabel>
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) =>
                    patchInput(index, { required: e.target.checked })
                  }
                />
                Påkrevd
              </RequiredLabel>
            </>
          )}
        </Row>
      ))}

      <AddRow>
        <AddButton
          type="button"
          onClick={() => onChange([...value, makeInputField()])}
        >
          + Spørsmål
        </AddButton>
        <AddButton
          type="button"
          onClick={() => onChange([...value, { type: "text", text: "" }])}
        >
          + Infotekst
        </AddButton>
      </AddRow>
    </Wrapper>
  );
};

export default HeaderFieldsEditor;

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 640px;
`;

const Empty = styled.p`
  margin: 0;
  color: var(--color-gray-6);
  font-style: italic;
`;

const Row = styled.div`
  border: 1px solid var(--color-border-muted);
  border-radius: var(--border-radius-md);
  padding: 0.85rem 1rem;
  background: var(--color-surface-base);
`;

const RowHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.6rem;
`;

const RowKind = styled.span`
  font-size: var(--font-size-detail);
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--color-gray-6);
`;

const RowActions = styled.div`
  display: flex;
  gap: var(--spacing-xs);
`;

const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.3rem;
  border: 1px solid var(--color-border-muted);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-base);
  color: var(--color-gray-7);
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.6rem;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
`;

const FieldLabel = styled.label`
  font-size: var(--font-size-detail);
  font-weight: 600;
  color: var(--color-gray-7);
`;

const fieldStyles = `
  font-size: var(--font-size-ui);
  padding: 0.45rem 0.6rem;
  border-radius: var(--border-radius-md);
  border: 1px solid var(--color-border-muted);
  width: 100%;
`;

const Input = styled.input`
  ${fieldStyles}
`;

const Select = styled.select`
  ${fieldStyles}
  background: var(--color-surface-base);
`;

const TextArea = styled.textarea`
  ${fieldStyles}
  min-height: 4.5rem;
  resize: vertical;
`;

const RequiredLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.6rem;
  font-size: var(--font-size-ui);
  color: var(--color-gray-7);
`;

const AddRow = styled.div`
  display: flex;
  gap: var(--spacing-sm);
`;

const AddButton = styled.button`
  font-size: var(--font-size-ui);
  font-weight: 600;
  padding: 0.45rem 0.85rem;
  border: 1px dashed var(--color-border-quiet);
  border-radius: var(--border-radius-md);
  background: transparent;
  color: var(--color-gray-7);
  cursor: pointer;

  &:hover {
    border-color: var(--color-blue-6);
    color: var(--color-blue-6);
  }
`;
