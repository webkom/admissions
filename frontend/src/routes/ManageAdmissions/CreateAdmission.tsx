import { AxiosError } from "axios";
import { useFormik } from "formik";
import * as Yup from "yup";
import { DateTime } from "luxon";
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import styled from "styled-components";

import ConfirmModal from "src/components/ConfirmModal";
import { StyledButton } from "src/components/LinkButton";
import LoadingBall from "src/components/LoadingBall";
import { useManageAdmission } from "src/query/hooks";
import {
  AdmissionMutationResponse,
  MutationAdmission,
  useManageCreateAdmission,
  useManageDeleteAdmission,
  useManageUpdateAdmission,
} from "src/query/mutations";
import { breakpoints } from "src/styles/designTokens";
import { getApiErrorMessage, getApiFieldErrors } from "src/utils/apiErrors";
import { toggleFromArray } from "src/utils/methods";

import GroupSelector from "./components/GroupSelector";
import HeaderFieldsEditor from "./components/HeaderFieldsEditor";

interface ReturnedData {
  type: "error" | "success";
  message: string;
}

const ADMISSION_TIME_ZONE = "Europe/Oslo";
const ADMISSION_FIELD_NAMES = [
  "title",
  "slug",
  "description",
  "header_fields",
  "open_from",
  "public_deadline",
  "closed_from",
  "admin_groups",
  "groups",
] as const;

const emptyAdmission: MutationAdmission = {
  title: "",
  slug: "",
  description: "",
  header_fields: [],
  open_from: "",
  public_deadline: "",
  closed_from: "",
  admin_groups: [],
  groups: [],
};

const formatDate = (date: DateTime): string =>
  date.toFormat("yyyy-MM-dd'T'HH:mm:ss");

const formatDateString = (dateString?: string): string =>
  formatDate(DateTime.fromISO(dateString ?? "").setZone(ADMISSION_TIME_ZONE));

const norwegianTimeToIso = (dateString: string): string | null =>
  DateTime.fromISO(dateString, { zone: ADMISSION_TIME_ZONE })
    .toUTC()
    .toISO({ includeOffset: true });

const formatReviewDate = (dateString: string): string => {
  const date = DateTime.fromISO(dateString, { zone: ADMISSION_TIME_ZONE });
  return date.isValid
    ? date.setLocale("nb").toFormat("dd. LLL yyyy 'kl.' HH:mm")
    : "Ikke satt";
};

const makeSlug = (title: string): string =>
  title
    .toLocaleLowerCase("nb-NO")
    .replaceAll("ø", "o")
    .replaceAll("æ", "ae")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

const validationSchema = Yup.object({
  title: Yup.string()
    .trim()
    .max(255, "Tittelen kan ikke være lengre enn 255 tegn")
    .required("Tittel er påkrevd"),
  slug: Yup.string()
    .trim()
    .min(4, "Slug må være minst 4 tegn")
    .max(200, "Slug kan ikke være lengre enn 200 tegn")
    .matches(
      /^[a-z0-9_-]+$/,
      "Bruk bare små bokstaver, tall, bindestrek og understrek",
    )
    .required("Slug er påkrevd"),
  description: Yup.string(),
  open_from: Yup.string().required("Åpningstidspunkt er påkrevd"),
  public_deadline: Yup.string()
    .required("Søknadsfrist er påkrevd")
    .test(
      "deadline-after-open",
      "Søknadsfristen må være etter åpningen",
      (value, context) =>
        !value || !context.parent.open_from || value > context.parent.open_from,
    ),
  closed_from: Yup.string()
    .required("Stengetidspunkt er påkrevd")
    .test(
      "close-after-deadline",
      "Stengingen kan ikke være før søknadsfristen",
      (value, context) =>
        !value ||
        !context.parent.public_deadline ||
        value >= context.parent.public_deadline,
    ),
  admin_groups: Yup.array()
    .of(Yup.string().required())
    .min(1, "Velg minst én admin-gruppe"),
  groups: Yup.array()
    .of(Yup.string().required())
    .min(1, "Velg minst én gruppe som har opptak"),
  header_fields: Yup.array().test(
    "valid-question-titles",
    "Alle spørsmål må inneholde minst 5 tegn",
    (fields) =>
      (fields ?? []).every(
        (field) => field.type === "text" || field.title.trim().length >= 5,
      ),
  ),
});

const CreateAdmission: React.FC = () => {
  const navigate = useNavigate();
  const { admissionSlug } = useParams();
  const isNew = !admissionSlug;
  const {
    data: admission,
    isLoading,
    error,
    refetch,
  } = useManageAdmission(admissionSlug ?? "", !isNew);
  const createAdmission = useManageCreateAdmission();
  const updateAdmission = useManageUpdateAdmission();
  const deleteAdmission = useManageDeleteAdmission();
  const initializedAdmission = useRef<string>();
  const submissionInFlight = useRef(false);
  const [returnedData, setReturnedData] = useState<ReturnedData>();
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(!isNew);

  const formik = useFormik<MutationAdmission>({
    initialValues: emptyAdmission,
    validationSchema,
    validateOnMount: true,
    onSubmit: (values) => {
      if (submissionInFlight.current) return;
      submissionInFlight.current = true;
      setReturnedData(undefined);
      const processedValues = {
        ...values,
        title: values.title.trim(),
        slug: values.slug?.trim(),
        open_from: norwegianTimeToIso(values.open_from) ?? "",
        public_deadline: norwegianTimeToIso(values.public_deadline) ?? "",
        closed_from: norwegianTimeToIso(values.closed_from) ?? "",
      };

      const onSuccess = (data: AdmissionMutationResponse) => {
        submissionInFlight.current = false;
        formik.resetForm({ values });
        setReturnedData({ type: "success", message: "Opptaket er lagret." });
        if (isNew && data.slug) navigate(`/manage/${data.slug}`);
      };

      const onError = (requestError: AxiosError) => {
        submissionInFlight.current = false;
        const fieldErrors = getApiFieldErrors(
          requestError,
          ADMISSION_FIELD_NAMES,
        );
        Object.entries(fieldErrors).forEach(([field, message]) =>
          formik.setFieldError(field, message),
        );
        setReturnedData({
          type: "error",
          message: getApiErrorMessage(
            requestError,
            "Opptaket kunne ikke lagres. Prøv igjen.",
          ),
        });
        window.setTimeout(() => {
          document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
        });
      };

      if (isNew) {
        createAdmission.mutate(
          { admission: processedValues },
          { onSuccess, onError },
        );
      } else {
        updateAdmission.mutate(
          { slug: admissionSlug ?? "", admission: processedValues },
          { onSuccess, onError },
        );
      }
    },
  });

  const isSaving = createAdmission.isPending || updateAdmission.isPending;
  const isDeleting = deleteAdmission.isPending;
  const hasUnsavedChanges = formik.dirty && !isSaving && !isDeleting;

  useEffect(() => {
    setReturnedData(undefined);
    initializedAdmission.current = undefined;
    setSlugManuallyEdited(!isNew);
  }, [admissionSlug, isNew]);

  useEffect(() => {
    if (!admission || initializedAdmission.current === admission.slug) return;
    formik.resetForm({
      values: {
        title: admission.title,
        slug: admission.slug,
        description: admission.description,
        header_fields: admission.header_fields,
        open_from: formatDateString(admission.open_from),
        public_deadline: formatDateString(admission.public_deadline),
        closed_from: formatDateString(admission.closed_from),
        admin_groups: admission.admin_groups?.map((group) => group.pk) ?? [],
        groups: admission.groups.map((group) => group.pk),
      },
    });
    initializedAdmission.current = admission.slug;
  }, [admission]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const warnBeforeLinkNavigation = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const link = target?.closest("a[href]");
      if (!link || event.defaultPrevented) return;
      if (
        !window.confirm(
          "Du har ulagrede endringer. Vil du forlate siden uten å lagre?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", warnBeforeLinkNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", warnBeforeLinkNavigation, true);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (formik.submitCount === 0 || formik.isValid) return;
    window.setTimeout(() => {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  }, [formik.submitCount]);

  const fieldError = (field: keyof MutationAdmission): string | undefined => {
    const message = formik.errors[field];
    const shouldShow = formik.submitCount > 0 || Boolean(formik.touched[field]);
    return shouldShow && typeof message === "string" ? message : undefined;
  };

  const handleDeleteAdmission = () => {
    if (!admission) return;
    setReturnedData(undefined);
    deleteAdmission.mutate(
      { slug: admission.slug },
      {
        onSuccess: () => {
          formik.resetForm();
          navigate("/manage/");
        },
        onError: (requestError) =>
          setReturnedData({
            type: "error",
            message: getApiErrorMessage(
              requestError,
              "Opptaket kunne ikke slettes. Prøv igjen.",
            ),
          }),
      },
    );
  };

  if (!isNew && isLoading) return <LoadingBall />;

  if (!isNew && error) {
    const notFound = error.response?.status === 404;
    return (
      <LoadState role="alert">
        <h2>
          {notFound ? "Opptaket finnes ikke" : "Kunne ikke laste opptaket"}
        </h2>
        <p>
          {notFound
            ? `Fant ikke opptaket ${admissionSlug}.`
            : getApiErrorMessage(error, "Prøv å laste opptaket på nytt.")}
        </p>
        {!notFound && (
          <StyledButton type="button" onClick={() => refetch()}>
            Prøv igjen
          </StyledButton>
        )}
      </LoadState>
    );
  }

  const invalidSubmission = formik.submitCount > 0 && !formik.isValid;

  return (
    <Form onSubmit={formik.handleSubmit} noValidate>
      <FormHeader>
        <Title>{isNew ? "Opprett nytt opptak" : admission?.title}</Title>
        <Lead>
          {isNew
            ? "Sett opp grunninformasjon, tidsrom, tilgang og spørsmål. Kontroller sammendraget før opptaket opprettes."
            : "Oppdater innstillingene og kontroller sammendraget før du lagrer."}
        </Lead>
      </FormHeader>

      {invalidSubmission && (
        <ValidationSummary role="alert">
          Kontroller feltene som er markert nedenfor før du lagrer.
        </ValidationSummary>
      )}

      <FormSection aria-labelledby="basic-information-title">
        <SectionHeader>
          <SectionNumber aria-hidden="true">1</SectionNumber>
          <div>
            <SectionTitle id="basic-information-title">
              Grunninformasjon
            </SectionTitle>
            <SectionDescription>
              Dette vises til søkerne på opptakssiden.
            </SectionDescription>
          </div>
        </SectionHeader>
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
              onBlur={formik.handleBlur}
              onChange={(event) => {
                const title = event.target.value;
                formik.setFieldValue("title", title);
                if (isNew && !slugManuallyEdited) {
                  formik.setFieldValue("slug", makeSlug(title));
                }
              }}
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
              onBlur={formik.handleBlur}
              onChange={(event) => {
                setSlugManuallyEdited(true);
                formik.handleChange(event);
              }}
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
              onBlur={formik.handleBlur}
              onChange={formik.handleChange}
              aria-describedby="admission-description-help"
            />
          </FieldBlock>
        </FieldGrid>
      </FormSection>

      <FormSection aria-labelledby="admission-dates-title">
        <SectionHeader>
          <SectionNumber aria-hidden="true">2</SectionNumber>
          <div>
            <SectionTitle id="admission-dates-title">Datoer</SectionTitle>
            <SectionDescription>
              Alle tidspunkter tolkes som norsk tid.
            </SectionDescription>
          </div>
        </SectionHeader>
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

      <FormSection aria-labelledby="admission-access-title">
        <SectionHeader>
          <SectionNumber aria-hidden="true">3</SectionNumber>
          <div>
            <SectionTitle id="admission-access-title">
              Grupper og tilgang
            </SectionTitle>
            <SectionDescription>
              Minst én admin-gruppe og én gruppe med opptak må velges.
            </SectionDescription>
          </div>
        </SectionHeader>
        <FieldStack>
          <FieldBlock $wide>
            <FieldLabel htmlFor="admin-groups">Admin-grupper</FieldLabel>
            <InputDescription id="admin-groups-description">
              Aktive medlemmer kan administrere hele opptaket og se alle søkere.
            </InputDescription>
            <GroupSelector
              id="admin-groups"
              value={formik.values.admin_groups}
              describedBy={`admin-groups-description${
                fieldError("admin_groups") ? " admin-groups-error" : ""
              }`}
              invalid={Boolean(fieldError("admin_groups"))}
              toggleGroup={(value) => {
                formik.setFieldTouched("admin_groups", true, false);
                formik.setFieldValue(
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
              Grupper som har opptak
            </FieldLabel>
            <InputDescription id="admission-groups-description">
              Ledere og opptaksansvarlige får tilgang til søkerne i sine
              grupper.
            </InputDescription>
            <GroupSelector
              id="admission-groups"
              value={formik.values.groups}
              describedBy={`admission-groups-description${
                fieldError("groups") ? " admission-groups-error" : ""
              }`}
              invalid={Boolean(fieldError("groups"))}
              toggleGroup={(value) => {
                formik.setFieldTouched("groups", true, false);
                formik.setFieldValue(
                  "groups",
                  toggleFromArray(formik.values.groups, value),
                );
              }}
            />
            {fieldError("groups") && (
              <FieldError id="admission-groups-error">
                {fieldError("groups")}
              </FieldError>
            )}
          </FieldBlock>
        </FieldStack>
      </FormSection>

      <FormSection aria-labelledby="additional-questions-title">
        <SectionHeader>
          <SectionNumber aria-hidden="true">4</SectionNumber>
          <div>
            <SectionTitle id="additional-questions-title">
              Tilleggsspørsmål
            </SectionTitle>
            <SectionDescription>
              Spørsmålene vises i denne rekkefølgen til søkeren.
            </SectionDescription>
          </div>
        </SectionHeader>
        <HeaderFieldsEditor
          value={formik.values.header_fields}
          onChange={(fields) => {
            formik.setFieldTouched("header_fields", true, false);
            formik.setFieldValue("header_fields", fields);
          }}
          error={fieldError("header_fields")}
          showErrors={
            formik.submitCount > 0 || Boolean(formik.touched.header_fields)
          }
        />
      </FormSection>

      <FormSection aria-labelledby="review-admission-title">
        <SectionHeader>
          <SectionNumber aria-hidden="true">5</SectionNumber>
          <div>
            <SectionTitle id="review-admission-title">
              Kontroller og lagre
            </SectionTitle>
            <SectionDescription>
              Oppsummeringen inneholder ikke kandidatdata.
            </SectionDescription>
          </div>
        </SectionHeader>
        <ReviewList>
          <div>
            <dt>Tittel</dt>
            <dd>{formik.values.title || "Ikke satt"}</dd>
          </div>
          <div>
            <dt>URL</dt>
            <dd>/{formik.values.slug || "ikke-satt"}/</dd>
          </div>
          <div>
            <dt>Åpner</dt>
            <dd>{formatReviewDate(formik.values.open_from)}</dd>
          </div>
          <div>
            <dt>Frist</dt>
            <dd>{formatReviewDate(formik.values.public_deadline)}</dd>
          </div>
          <div>
            <dt>Stenger</dt>
            <dd>{formatReviewDate(formik.values.closed_from)}</dd>
          </div>
          <div>
            <dt>Tilgang</dt>
            <dd>
              {formik.values.admin_groups.length} admin-gruppe(r),{" "}
              {formik.values.groups.length} opptaksgruppe(r)
            </dd>
          </div>
          <div>
            <dt>Tillegg</dt>
            <dd>{formik.values.header_fields.length} felt</dd>
          </div>
        </ReviewList>

        {returnedData && (
          <FormStatus
            $type={returnedData.type}
            role={returnedData.type === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            {returnedData.message}
          </FormStatus>
        )}

        <ActionRow>
          <StyledButton type="submit" disabled={isSaving || isDeleting} success>
            {isSaving
              ? "Lagrer…"
              : isNew
                ? "Opprett opptak"
                : "Lagre endringer"}
          </StyledButton>
          {hasUnsavedChanges && (
            <UnsavedStatus>Ulagrede endringer</UnsavedStatus>
          )}
        </ActionRow>
      </FormSection>

      {!isNew && (
        <DangerSection aria-labelledby="delete-admission-title">
          <SectionTitle id="delete-admission-title">Slett opptak</SectionTitle>
          <SectionDescription>
            Opptaket kan bare slettes etter at det har stengt. Søknader og
            intervjudata slettes permanent.
          </SectionDescription>
          <ConfirmModal
            title="Slett opptak"
            trigger={({ onClick }) => (
              <StyledButton
                type="button"
                disabled={
                  isDeleting ||
                  DateTime.fromISO(admission?.closed_from ?? "")
                    .diffNow()
                    .toMillis() > 0
                }
                onClick={onClick}
                danger
              >
                {isDeleting ? "Sletter…" : "Slett opptak"}
              </StyledButton>
            )}
            message="Er du sikker? Alle søknader og intervjudata for opptaket slettes permanent."
            cancelText="Avbryt"
            confirmText="Slett permanent"
            onConfirm={handleDeleteAdmission}
          />
        </DangerSection>
      )}
    </Form>
  );
};

interface DateFieldProps {
  id: "open_from" | "public_deadline" | "closed_from";
  label: string;
  description: string;
  value: string;
  min?: string;
  error?: string;
  onBlur: React.FocusEventHandler<HTMLInputElement>;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}

const DateField: React.FC<DateFieldProps> = ({
  id,
  label,
  description,
  value,
  min,
  error,
  onBlur,
  onChange,
}) => (
  <FieldBlock>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <InputDescription id={`${id}-description`}>{description}</InputDescription>
    <Input
      id={id}
      name={id}
      type="datetime-local"
      value={value}
      min={min}
      onBlur={onBlur}
      onChange={onChange}
      aria-describedby={`${id}-description${error ? ` ${id}-error` : ""}`}
      aria-invalid={Boolean(error)}
    />
    {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
  </FieldBlock>
);

export default CreateAdmission;

const Form = styled.form`
  width: min(100%, var(--content-width-wide));
  padding: 0 var(--spacing-xl) var(--spacing-5xl);

  @media screen and (max-width: ${breakpoints.handheld}) {
    padding-inline: var(--spacing-md);
  }
`;

const FormHeader = styled.header`
  padding: var(--spacing-md) 0 var(--spacing-2xl);
`;

const Title = styled.h1`
  margin: 0;
  font-size: var(--font-size-xl);
`;

const Lead = styled.p`
  max-width: var(--content-width-readable);
  margin: var(--spacing-md) 0 0;
  color: var(--color-text-muted);
  line-height: var(--line-height-relaxed);
`;

const FormSection = styled.section`
  padding: var(--spacing-3xl) 0;
  border-top: var(--border-width-default) solid var(--color-border-soft);
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-xl);
`;

const SectionNumber = styled.span`
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: var(--control-height-sm);
  height: var(--control-height-sm);
  border-radius: var(--border-radius-pill);
  background: var(--color-brand);
  color: var(--color-absolute-white);
  font-size: var(--font-size-detail);
  font-weight: 700;
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-size: var(--font-size-heading-xs);
`;

const SectionDescription = styled.p`
  max-width: var(--content-width-readable);
  margin: var(--spacing-xs) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
`;

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
  font-weight: 600;
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

const ValidationSummary = styled.div`
  margin-bottom: var(--spacing-xl);
  padding: var(--spacing-md) var(--spacing-lg);
  border: var(--border-width-default) solid var(--color-danger-border);
  border-radius: var(--border-radius-md);
  background: var(--color-danger-bg);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  font-weight: 600;
`;

const ReviewList = styled.dl`
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(var(--control-min-width), 100%), 1fr)
  );
  gap: var(--spacing-xl);
  margin: 0;

  div {
    min-width: 0;
  }

  dt {
    color: var(--color-text-muted);
    font-size: var(--font-size-detail);
    font-weight: 600;
  }

  dd {
    margin: var(--spacing-xs) 0 0;
    overflow-wrap: anywhere;
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }
`;

const FormStatus = styled.div<{ $type: ReturnedData["type"] }>`
  margin-top: var(--spacing-xl);
  padding: var(--spacing-md) var(--spacing-lg);
  border: var(--border-width-default) solid
    ${({ $type }) =>
      $type === "success"
        ? "var(--color-success-border)"
        : "var(--color-danger-border)"};
  border-radius: var(--border-radius-md);
  background: ${({ $type }) =>
    $type === "success" ? "var(--color-success-bg)" : "var(--color-danger-bg)"};
  color: ${({ $type }) =>
    $type === "success" ? "var(--color-success)" : "var(--color-danger)"};
  font-size: var(--font-size-sm);
  font-weight: 600;
`;

const ActionRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-lg);
  margin-top: var(--spacing-xl);
`;

const UnsavedStatus = styled.span`
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
`;

const DangerSection = styled.section`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-md);
  padding: var(--spacing-2xl) 0;
  border-top: var(--border-width-default) solid var(--color-danger-border);
`;

const LoadState = styled.div`
  max-width: var(--content-width-form);
  margin: var(--spacing-3xl);
  padding: var(--spacing-xl);
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-base);

  h2 {
    margin-top: 0;
  }
`;
