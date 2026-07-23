import type { FormikProps } from "formik";
import React from "react";
import type { ChangeEventHandler, FocusEventHandler, ReactNode } from "react";
import styled from "styled-components";

import type { MutationAdmission } from "src/query/mutations";
import { toggleFromArray } from "src/utils/methods";

import type { AdmissionFieldError } from "../useAdmissionEditor";
import {
  Section,
  SectionDescription,
  SectionHeader,
  SectionNumber,
  SectionTitle,
} from "./AdmissionSectionStyles";
import GroupSelector from "./GroupSelector";
import HeaderFieldsEditor from "./HeaderFieldsEditor";
import { useManageGroups } from "src/query/hooks";

interface AdmissionDetailsSectionsProps {
  formik: FormikProps<MutationAdmission>;
  fieldError: AdmissionFieldError;
  isNew: boolean;
  updateTitle: (title: string) => void;
  updateSlug: (slug: string) => void;
}

const AdmissionDetailsSections = ({
  formik,
  fieldError,
  isNew,
  updateTitle,
  updateSlug,
}: AdmissionDetailsSectionsProps) => (
  <AdmissionDetailsContent
    formik={formik}
    fieldError={fieldError}
    isNew={isNew}
    updateTitle={updateTitle}
    updateSlug={updateSlug}
  />
);

const AdmissionDetailsContent = ({
  formik,
  fieldError,
  isNew,
  updateTitle,
  updateSlug,
}: AdmissionDetailsSectionsProps) => {
  const { data: availableGroups } = useManageGroups();
  const selectedGroups = formik.values.groups
    .map((groupId) => availableGroups?.find((group) => group.pk === groupId))
    .filter((group): group is NonNullable<typeof group> => Boolean(group));

  const toggleAdmissionGroup = (groupId: string) => {
    const groups = toggleFromArray(formik.values.groups, groupId);
    const groupQuestions = Object.fromEntries(
      groups.map((id) => [id, formik.values.group_questions[id] ?? []]),
    );
    void formik.setFieldTouched("groups", true, false);
    void formik.setFieldValue("groups", groups);
    void formik.setFieldValue("group_questions", groupQuestions);
  };

  return (
    <>
      <FormSection
        number="1"
        titleId="basic-information-title"
        title="Grunninformasjon"
        description="Dette vises til søkerne på opptakssiden."
      >
        <FieldGrid>
          <FieldBlock>
            <FieldLabel htmlFor="admission-title">Tittel</FieldLabel>
            <InputDescription id="admission-title-description">
              Navnet søkerne ser på opptaket.
            </InputDescription>
            <Input
              id="admission-title"
              name="title"
              value={formik.values.title}
              data-admission-field="title"
              onBlur={formik.handleBlur}
              onChange={(event) => updateTitle(event.target.value)}
              aria-describedby={`admission-title-description${
                fieldError("title") ? " admission-title-error" : ""
              }`}
              aria-invalid={Boolean(fieldError("title"))}
            />
            {fieldError("title") && (
              <FieldError id="admission-title-error">
                {fieldError("title")}
              </FieldError>
            )}
          </FieldBlock>

          <FieldBlock>
            <FieldLabel htmlFor="admission-slug">Slug</FieldLabel>
            <InputDescription id="admission-slug-description">
              URL: opptak.abakus.no/{formik.values.slug || "komiteopptak-2027"}/
            </InputDescription>
            <Input
              id="admission-slug"
              name="slug"
              value={formik.values.slug}
              data-admission-field="slug"
              onBlur={formik.handleBlur}
              onChange={(event) => updateSlug(event.target.value)}
              placeholder="komiteopptak-2027"
              disabled={!isNew}
              aria-describedby={`admission-slug-description${
                fieldError("slug") ? " admission-slug-error" : ""
              }`}
              aria-invalid={Boolean(fieldError("slug"))}
            />
            {fieldError("slug") && (
              <FieldError id="admission-slug-error">
                {fieldError("slug")}
              </FieldError>
            )}
          </FieldBlock>

          <FieldBlock $wide>
            <FieldLabel htmlFor="admission-description">Beskrivelse</FieldLabel>
            <InputDescription id="admission-description-help">
              En kort forklaring av hva opptaket gjelder. Feltet kan stå tomt.
            </InputDescription>
            <TextArea
              id="admission-description"
              name="description"
              value={formik.values.description}
              data-admission-field="description"
              onBlur={formik.handleBlur}
              onChange={formik.handleChange}
              aria-describedby={`admission-description-help${
                fieldError("description") ? " admission-description-error" : ""
              }`}
              aria-invalid={Boolean(fieldError("description"))}
            />
            {fieldError("description") && (
              <FieldError id="admission-description-error">
                {fieldError("description")}
              </FieldError>
            )}
          </FieldBlock>
        </FieldGrid>
      </FormSection>

      <FormSection
        number="2"
        titleId="admission-dates-title"
        title="Datoer"
        description="Alle tidspunkter tolkes som norsk tid."
      >
        <FieldGrid>
          <DateField
            id="open_from"
            label="Opptaket åpner"
            description="Fra dette tidspunktet kan søkere sende inn søknader."
            value={formik.values.open_from}
            error={fieldError("open_from")}
            onBlur={formik.handleBlur}
            onChange={formik.handleChange}
          />
          <DateField
            id="public_deadline"
            label="Søknadsfrist"
            description="Søknader etter fristen merkes som sene, men kan sendes frem til stenging."
            value={formik.values.public_deadline}
            min={formik.values.open_from || undefined}
            error={fieldError("public_deadline")}
            onBlur={formik.handleBlur}
            onChange={formik.handleChange}
          />
          <DateField
            id="closed_from"
            label="Opptaket stenger"
            description="Etter dette tidspunktet kan søknader ikke lenger opprettes eller endres."
            value={formik.values.closed_from}
            min={formik.values.public_deadline || undefined}
            error={fieldError("closed_from")}
            onBlur={formik.handleBlur}
            onChange={formik.handleChange}
          />
        </FieldGrid>
      </FormSection>

      <FormSection
        number="3"
        titleId="admission-access-title"
        title="Opptaksgrupper og tilgang"
        description="En opptaksgruppe er delen av organisasjonen som rekrutterer — for eksempel en komité, revygruppe eller stilling. Den styrer tilgang til søkere og gruppespesifikke spørsmål, men deler ikke intervjuplanen i egne grupper."
      >
        <FieldStack>
          <FieldBlock $wide>
            <FieldLabel htmlFor="admin-groups">
              Ansvarlige opptaksgrupper
            </FieldLabel>
            <InputDescription id="admin-groups-description">
              Velg opptaksgruppene som har ansvar for hele opptaket. Aktive
              ledere og opptaksansvarlige kan administrere alt og se alle
              søkere.
            </InputDescription>
            <GroupSelector
              id="admin-groups"
              value={formik.values.admin_groups}
              addLabel="Legg til ansvarlig opptaksgruppe"
              emptyLabel="Ingen ansvarlige opptaksgrupper er valgt."
              selectedLabel="Valgte ansvarlige opptaksgrupper"
              describedBy={`admin-groups-description${
                fieldError("admin_groups") ? " admin-groups-error" : ""
              }`}
              invalid={Boolean(fieldError("admin_groups"))}
              admissionField="admin_groups"
              toggleGroup={(value) => {
                void formik.setFieldTouched("admin_groups", true, false);
                void formik.setFieldValue(
                  "admin_groups",
                  toggleFromArray(formik.values.admin_groups, value),
                );
              }}
            />
            {fieldError("admin_groups") && (
              <FieldError id="admin-groups-error">
                {fieldError("admin_groups")}
              </FieldError>
            )}
          </FieldBlock>

          <FieldBlock $wide>
            <FieldLabel htmlFor="admission-groups">
              Opptaksgrupper som rekrutterer
            </FieldLabel>
            <InputDescription id="admission-groups-description">
              Velg opptaksgruppene søkerne kan søke til. Ledere og
              opptaksansvarlige får tilgang til søkerne i sine grupper.
            </InputDescription>
            <GroupSelector
              id="admission-groups"
              value={formik.values.groups}
              addLabel="Legg til opptaksgruppe"
              emptyLabel="Ingen rekrutterende opptaksgrupper er valgt."
              selectedLabel="Valgte rekrutterende opptaksgrupper"
              describedBy={`admission-groups-description${
                fieldError("groups") ? " admission-groups-error" : ""
              }`}
              invalid={Boolean(fieldError("groups"))}
              admissionField="groups"
              toggleGroup={toggleAdmissionGroup}
            />
            {fieldError("groups") && (
              <FieldError id="admission-groups-error">
                {fieldError("groups")}
              </FieldError>
            )}
          </FieldBlock>
        </FieldStack>
      </FormSection>

      <FormSection
        number="4"
        titleId="additional-questions-title"
        title="Gruppespesifikke spørsmål"
        description="Vises bare når søkeren velger den aktuelle opptaksgruppen."
      >
        <QuestionEditorList data-admission-field="group_questions">
          {selectedGroups.length === 0 ? (
            <InputDescription>
              Velg opptaksgrupper over for å legge til spørsmål.
            </InputDescription>
          ) : (
            selectedGroups.map((group) => (
              <QuestionEditor key={group.pk}>
                <QuestionEditorTitle>{group.name}</QuestionEditorTitle>
                <HeaderFieldsEditor
                  groupName={group.name}
                  value={formik.values.group_questions[group.pk] ?? []}
                  onChange={(fields) => {
                    void formik.setFieldTouched("group_questions", true, false);
                    void formik.setFieldValue("group_questions", {
                      ...formik.values.group_questions,
                      [group.pk]: fields,
                    });
                  }}
                  error={fieldError("group_questions")}
                  showErrors={
                    formik.submitCount > 0 ||
                    Boolean(formik.touched.group_questions)
                  }
                />
              </QuestionEditor>
            ))
          )}
        </QuestionEditorList>
      </FormSection>
    </>
  );
};

interface FormSectionProps {
  number: string;
  titleId: string;
  title: string;
  description: string;
  children: ReactNode;
}

const FormSection = ({
  number,
  titleId,
  title,
  description,
  children,
}: FormSectionProps) => (
  <Section aria-labelledby={titleId}>
    <SectionHeader>
      <SectionNumber aria-hidden="true">{number}</SectionNumber>
      <div>
        <SectionTitle id={titleId}>{title}</SectionTitle>
        <SectionDescription>{description}</SectionDescription>
      </div>
    </SectionHeader>
    {children}
  </Section>
);

interface DateFieldProps {
  id: "open_from" | "public_deadline" | "closed_from";
  label: string;
  description: string;
  value: string;
  min?: string;
  error?: string;
  onBlur: FocusEventHandler<HTMLInputElement>;
  onChange: ChangeEventHandler<HTMLInputElement>;
}

const DateField = ({
  id,
  label,
  description,
  value,
  min,
  error,
  onBlur,
  onChange,
}: DateFieldProps) => (
  <FieldBlock>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <InputDescription id={`${id}-description`}>{description}</InputDescription>
    <Input
      id={id}
      name={id}
      type="datetime-local"
      value={value}
      data-admission-field={id}
      min={min}
      onBlur={onBlur}
      onChange={onChange}
      aria-describedby={`${id}-description${error ? ` ${id}-error` : ""}`}
      aria-invalid={Boolean(error)}
    />
    {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
  </FieldBlock>
);

export default AdmissionDetailsSections;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(var(--form-control-width), 100%), 1fr)
  );
  gap: var(--spacing-xl);
`;

const FieldStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2xl);
`;

const QuestionEditorList = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xl);
`;

const QuestionEditor = styled.section`
  padding: var(--spacing-lg);
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-md);
`;

const QuestionEditorTitle = styled.h3`
  margin: 0;
  font-size: var(--font-size-md);
`;

const FieldBlock = styled.div<{ $wide?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-sm);
  min-width: 0;
  ${(props) => (props.$wide ? "grid-column: 1 / -1;" : "")}
`;

const FieldLabel = styled.label`
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
`;

const InputDescription = styled.span`
  display: block;
  max-width: var(--content-width-readable);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
`;

const controlStyles = `
  width: min(100%, var(--form-control-width));
  min-height: var(--control-height-md);
  padding: var(--spacing-sm) var(--spacing-md);
  border: var(--border-width-default) solid var(--color-border-muted);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-base);
  color: var(--color-text-primary);
  font-size: var(--font-size-md);

  &[aria-invalid="true"] {
    border-color: var(--color-danger-border);
  }

  &:disabled {
    background: var(--color-surface-disabled);
    color: var(--color-text-disabled);
  }
`;

const Input = styled.input`
  ${controlStyles}
`;

const TextArea = styled.textarea`
  ${controlStyles}
  width: min(100%, var(--content-width-form));
  min-height: var(--form-textarea-min-height);
  resize: vertical;
`;

const FieldError = styled.span`
  color: var(--color-danger);
  font-size: var(--font-size-detail);
`;
