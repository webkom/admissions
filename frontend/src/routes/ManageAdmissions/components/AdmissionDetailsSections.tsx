import type { FormikProps } from "formik";
import React from "react";
import type { ReactNode } from "react";
import styled from "styled-components";

import type { MutationAdmission } from "src/query/mutations";

import type { AdmissionFieldError } from "../useAdmissionEditor";
import {
  Section,
  SectionDescription,
  SectionHeader,
  SectionNumber,
  SectionTitle,
} from "./AdmissionSectionStyles";
import AdmissionDateTimePicker from "./AdmissionDateTimePicker";
import CommitteeContentEditor from "./CommitteeContentEditor";
import GroupSelector from "./GroupSelector";
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

  const setAdminGroups = (groupIds: string[]) => {
    void formik.setFieldTouched("admin_groups", true, false);
    void formik.setFieldValue("admin_groups", Array.from(new Set(groupIds)));
  };

  const setAdmissionGroups = (groupIds: string[]) => {
    const groups = Array.from(new Set(groupIds));
    const groupContent = { ...formik.values.group_content };

    groups.forEach((groupId) => {
      if (
        availableGroups?.some((group) => group.pk === groupId) &&
        !groupContent[groupId]
      ) {
        groupContent[groupId] = {
          committee_info: null,
          application_guidance: null,
          interview_description: null,
        };
      }
    });

    void formik.setFieldTouched("groups", true, false);
    void formik.setFieldValue("groups", groups);
    void formik.setFieldValue("group_content", groupContent);
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
              Navnet som vises for brukere når de søker på opptaket
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
              Opptaket vil ligge under opptak.abakus.no/
              {formik.values.slug || "komitee"}/
            </InputDescription>
            <Input
              id="admission-slug"
              name="slug"
              value={formik.values.slug}
              data-admission-field="slug"
              onBlur={formik.handleBlur}
              onChange={(event) => updateSlug(event.target.value)}
              placeholder="komitee"
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
        description="Alle tider vises i norsk tid."
      >
        <DateGrid>
          <DateField
            id="open_from"
            label="Opptaket åpner"
            description="Når søknadsperioden skal starte."
            value={formik.values.open_from}
            error={fieldError("open_from")}
            onBlur={() => {
              void formik.setFieldTouched("open_from", true);
            }}
            onChange={(value) => {
              void formik.setFieldValue("open_from", value);
            }}
          />
          <DateField
            id="public_deadline"
            label="Søknadsfrist"
            description="Etter fristen kan søkere fortsatt redigere, men behandling er ikke garantert."
            value={formik.values.public_deadline}
            min={formik.values.open_from || undefined}
            minExclusive
            error={fieldError("public_deadline")}
            onBlur={() => {
              void formik.setFieldTouched("public_deadline", true);
            }}
            onChange={(value) => {
              void formik.setFieldValue("public_deadline", value);
            }}
          />
          <DateField
            id="closed_from"
            label="Opptaket stenger"
            description="Etter dette tidspunktet kan ingen sende inn eller endre søknaden."
            value={formik.values.closed_from}
            min={formik.values.public_deadline || undefined}
            error={fieldError("closed_from")}
            onBlur={() => {
              void formik.setFieldTouched("closed_from", true);
            }}
            onChange={(value) => {
              void formik.setFieldValue("closed_from", value);
            }}
          />
        </DateGrid>
      </FormSection>

      <FormSection
        number="3"
        titleId="admission-access-title"
        title="Opptaksgrupper og tilgang"
        description="En opptaksgruppe er delen av organisasjonen som rekrutterer — for eksempel en komité, revygruppe eller stilling. Den styrer tilgang til søkerne, men deler ikke intervjuplanen i egne grupper."
      >
        <FieldStack>
          <FieldBlock $wide>
            <FieldLabel htmlFor="admin-groups">Admin-grupper</FieldLabel>
            <InputDescription id="admin-groups-description">
              Medlemmene av disse gruppene får tilgang til å se samtlige søkere.
            </InputDescription>
            <GroupSelector
              id="admin-groups"
              value={formik.values.admin_groups}
              addLabel="Legg til gruppe"
              emptyLabel=""
              invalid={Boolean(fieldError("admin_groups"))}
              setGroups={setAdminGroups}
            />
            {fieldError("admin_groups") && (
              <FieldError id="admin-groups-error">
                {fieldError("admin_groups")}
              </FieldError>
            )}
          </FieldBlock>

          <FieldBlock $wide>
            <FieldLabel htmlFor="admission-groups">
              Grupper som har opptak
            </FieldLabel>
            <InputDescription id="admission-groups-description">
              Ledere og opptaksansvarlige i disse gruppene kan se søknadene til
              sin respektive gruppe.
            </InputDescription>
            <GroupSelector
              id="admission-groups"
              value={formik.values.groups}
              addLabel="Legg til gruppe"
              emptyLabel=""
              invalid={Boolean(fieldError("groups"))}
              setGroups={setAdmissionGroups}
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
        titleId="committee-content-title"
        title="Komitéinnhold"
        description="Tilpass informasjonen søkerne ser når de velger komité og skriver søknaden."
      >
        <CommitteeContentEditor
          groups={selectedGroups}
          value={formik.values.group_content}
          error={fieldError("group_content")}
          onChange={(groupId, content) => {
            void formik.setFieldTouched("group_content", true, false);
            void formik.setFieldValue("group_content", {
              ...formik.values.group_content,
              [groupId]: content,
            });
          }}
        />
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
  minExclusive?: boolean;
  error?: string;
  onBlur: () => void;
  onChange: (value: string) => void;
}

const DateField = ({
  id,
  label,
  description,
  value,
  min,
  minExclusive,
  error,
  onBlur,
  onChange,
}: DateFieldProps) => (
  <DateFieldBlock>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <InputDescription id={`${id}-description`}>{description}</InputDescription>
    <AdmissionDateTimePicker
      id={id}
      label={label}
      value={value}
      min={min}
      minExclusive={minExclusive}
      onBlur={onBlur}
      onChange={onChange}
      describedBy={`${id}-description`}
      invalid={Boolean(error)}
      error={error}
    />
  </DateFieldBlock>
);

export default AdmissionDetailsSections;

const FieldGrid = styled.div<{ $min?: string }>`
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(
      min(${(props) => props.$min ?? "var(--form-control-width)"}, 100%),
      1fr
    )
  );
  gap: var(--spacing-xl);
`;

const DateGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  grid-template-rows: auto auto auto;
  gap: var(--spacing-xl);
`;

const DateFieldBlock = styled.div`
  display: grid;
  grid-template-rows: subgrid;
  grid-row: span 3;
  gap: var(--spacing-sm);
  min-width: 0;
`;

const FieldStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2xl);
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
