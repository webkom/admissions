import React from "react";
import styled from "styled-components";
import { ArrowDown, ArrowUp, Layers3, Trash2 } from "lucide-react";
import {
  FieldModel,
  InputFieldModel,
  getDefaultPlaceholder,
} from "src/utils/jsonFields";
import { iconSizes } from "src/styles/designTokens";

const INPUT_TYPE_OPTIONS: { value: InputFieldModel["type"]; label: string }[] =
  [
    { value: "textinput", label: "Kort tekst" },
    { value: "textarea", label: "Lang tekst" },
    { value: "numberinput", label: "Tall" },
    { value: "phoneinput", label: "Telefon" },
    { value: "checkbox", label: "Avkrysningsboks" },
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
  error?: string;
  showErrors?: boolean;
};

const HeaderFieldsEditor: React.FC<Props> = ({
  value,
  onChange,
  error,
  showErrors = false,
}) => {
  const replaceAt = (index: number, next: FieldModel) =>
    onChange(value.map((field, current) => (current === index ? next : field)));

  const removeAt = (index: number) =>
    onChange(value.filter((_, current) => current !== index));

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
      <ScopeCallout>
        <Layers3 size={iconSizes.control} aria-hidden="true" />
        <div>
          <ScopeTitle>Gjelder denne komiteen i dette opptaket</ScopeTitle>
          <ScopeDescription>
            Svaret vises bare når søkeren velger denne komiteen, og blir ikke
            gjenbrukt i andre opptak.
          </ScopeDescription>
        </div>
      </ScopeCallout>
      {value.length === 0 && <Empty>Ingen ekstra spørsmål er lagt til.</Empty>}

      {value.map((field, index) => {
        const fieldKey = field.type === "text" ? `text-${index}` : field.id;
        const contentId = `header-field-${fieldKey}`;
        const titleError =
          field.type !== "text" && showErrors && field.title.trim().length < 5;

        return (
          <Row key={fieldKey}>
            <RowHeader>
              <RowKind>
                {field.type === "text"
                  ? "Infotekst for komiteen"
                  : `Spørsmål for komiteen ${index + 1}`}
              </RowKind>
              <RowActions>
                <IconButton
                  type="button"
                  aria-label="Flytt opp"
                  disabled={index === 0}
                  onClick={() => moveBy(index, -1)}
                >
                  <ArrowUp size={iconSizes.control} aria-hidden="true" />
                </IconButton>
                <IconButton
                  type="button"
                  aria-label="Flytt ned"
                  disabled={index === value.length - 1}
                  onClick={() => moveBy(index, 1)}
                >
                  <ArrowDown size={iconSizes.control} aria-hidden="true" />
                </IconButton>
                <IconButton
                  type="button"
                  aria-label="Fjern"
                  onClick={() => removeAt(index)}
                >
                  <Trash2 size={iconSizes.control} aria-hidden="true" />
                </IconButton>
              </RowActions>
            </RowHeader>

            {field.type === "text" ? (
              <Field>
                <FieldLabel htmlFor={contentId}>
                  Tekst som vises til søkeren
                </FieldLabel>
                <TextArea
                  id={contentId}
                  value={field.text}
                  onChange={(event) =>
                    replaceAt(index, { type: "text", text: event.target.value })
                  }
                  placeholder="Skriv en forklarende tekst…"
                />
              </Field>
            ) : (
              <>
                <Grid>
                  <Field>
                    <FieldLabel htmlFor={`${contentId}-type`}>Type</FieldLabel>
                    <Select
                      id={`${contentId}-type`}
                      value={field.type}
                      onChange={(event) =>
                        patchInput(index, {
                          type: event.target.value as InputFieldModel["type"],
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
                    <FieldLabel htmlFor={`${contentId}-title`}>
                      Spørsmål
                    </FieldLabel>
                    <Input
                      id={`${contentId}-title`}
                      value={field.title}
                      data-admission-field="header_fields"
                      aria-invalid={titleError}
                      aria-describedby={
                        titleError ? `${contentId}-title-error` : undefined
                      }
                      onChange={(event) =>
                        patchInput(index, { title: event.target.value })
                      }
                      placeholder="Hvilket trinn går du på?"
                    />
                    {titleError && (
                      <FieldError id={`${contentId}-title-error`}>
                        Spørsmålet må inneholde minst 5 tegn.
                      </FieldError>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${contentId}-label`}>
                      Hjelpetekst
                    </FieldLabel>
                    <Input
                      id={`${contentId}-label`}
                      value={field.label}
                      onChange={(event) =>
                        patchInput(index, { label: event.target.value })
                      }
                      placeholder="Valgfri utdypning"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${contentId}-placeholder`}>
                      Plassholder
                    </FieldLabel>
                    <Input
                      id={`${contentId}-placeholder`}
                      value={field.placeholder}
                      onChange={(event) =>
                        patchInput(index, { placeholder: event.target.value })
                      }
                      placeholder="Vises i tomt felt"
                    />
                  </Field>
                </Grid>
                <RequiredLabel>
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) =>
                      patchInput(index, { required: event.target.checked })
                    }
                  />
                  Påkrevd
                </RequiredLabel>
              </>
            )}
          </Row>
        );
      })}

      {error && (
        <EditorError
          id="header-fields-error"
          role="alert"
          tabIndex={-1}
          data-admission-field="header_fields"
        >
          {error}
        </EditorError>
      )}

      <AddRow>
        <AddButton
          type="button"
          onClick={() => onChange([...value, makeInputField()])}
        >
          Legg til spørsmål for komiteen
        </AddButton>
        <AddButton
          type="button"
          onClick={() => onChange([...value, { type: "text", text: "" }])}
        >
          Legg til infotekst for komiteen
        </AddButton>
      </AddRow>

      {value.length > 0 && (
        <Preview aria-labelledby="question-preview-title">
          <PreviewTitle id="question-preview-title">
            Forhåndsvisning av komitéspørsmål
          </PreviewTitle>
          {value.map((field, index) =>
            field.type === "text" ? (
              <PreviewText key={`preview-text-${index}`}>
                {field.text || "Tom infotekst"}
              </PreviewText>
            ) : (
              <PreviewField key={`preview-${field.id}`}>
                <strong>
                  {field.title || "Spørsmål uten tekst"}
                  {field.required ? " *" : ""}
                </strong>
                {field.label && <span>{field.label}</span>}
                <PreviewValue>
                  {field.type === "checkbox"
                    ? "Ikke avkrysset / avkrysset"
                    : getDefaultPlaceholder(field.type, field.placeholder)}
                </PreviewValue>
              </PreviewField>
            ),
          )}
        </Preview>
      )}
    </Wrapper>
  );
};

export default HeaderFieldsEditor;

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  width: min(100%, var(--content-width-form));
`;

const Empty = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-style: italic;
`;

const ScopeCallout = styled.div`
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  border: var(--border-width-default) solid var(--color-brand-border);
  border-left-width: var(--border-width-emphasis);
  border-radius: var(--border-radius-md);
  background: var(--color-brand-soft);
  color: var(--color-brand);
`;

const ScopeTitle = styled.strong`
  display: block;
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
`;

const ScopeDescription = styled.p`
  margin: var(--spacing-xs) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
  line-height: var(--line-height-base);
`;

const Row = styled.div`
  padding: var(--spacing-lg);
  border: var(--border-width-default) solid var(--color-border-muted);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-base);
`;

const RowHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
`;

const RowKind = styled.span`
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-caps);
`;

const RowActions = styled.div`
  display: flex;
  gap: var(--spacing-xs);
`;

const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--control-height-sm);
  min-height: var(--control-height-sm);
  padding: var(--spacing-sm);
  border: var(--border-width-default) solid var(--color-border-muted);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-base);
  color: var(--color-text-primary);
  cursor: pointer;

  &:disabled {
    opacity: var(--opacity-faint);
    cursor: not-allowed;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(var(--control-min-width), 100%), 1fr)
  );
  gap: var(--spacing-md);
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
`;

const FieldLabel = styled.label`
  color: var(--color-text-primary);
  font-size: var(--font-size-detail);
  font-weight: var(--font-weight-semibold);
`;

const fieldStyles = `
  width: 100%;
  min-height: var(--control-height-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border: var(--border-width-default) solid var(--color-border-muted);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-base);
  color: var(--color-text-primary);
  font-size: var(--font-size-ui);

  &[aria-invalid="true"] {
    border-color: var(--color-danger-border);
  }
`;

const Input = styled.input`
  ${fieldStyles}
`;

const Select = styled.select`
  ${fieldStyles}
`;

const TextArea = styled.textarea`
  ${fieldStyles}
  min-height: var(--form-textarea-min-height);
  resize: vertical;
`;

const RequiredLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
  color: var(--color-text-primary);
  font-size: var(--font-size-ui);
`;

const AddRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-md);
`;

const AddButton = styled.button`
  min-height: var(--control-height-sm);
  padding: 0 var(--spacing-lg);
  border: var(--border-width-default) dashed var(--color-border-quiet);
  border-radius: var(--border-radius-md);
  background: transparent;
  color: var(--color-text-primary);
  font-size: var(--font-size-ui);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;

  &:hover {
    border-color: var(--color-brand);
    color: var(--color-brand);
  }
`;

const FieldError = styled.span`
  color: var(--color-danger);
  font-size: var(--font-size-detail);
`;

const EditorError = styled(FieldError)`
  display: block;
`;

const Preview = styled.section`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  border-left: var(--border-width-emphasis) solid var(--color-brand);
  background: var(--color-surface-subtle);
`;

const PreviewTitle = styled.h3`
  margin: 0;
  font-size: var(--font-size-md);
`;

const PreviewText = styled.p`
  margin: 0;
  color: var(--color-text-muted);
`;

const PreviewField = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-detail);
  }
`;

const PreviewValue = styled.span`
  min-height: var(--control-height-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-base);
  color: var(--color-text-subtle);
`;
