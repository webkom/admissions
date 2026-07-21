import type { AxiosError } from "axios";
import { useFormik } from "formik";
import { DateTime } from "luxon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import * as Yup from "yup";

import { useManageAdmission } from "src/query/hooks";
import {
  type AdmissionMutationResponse,
  type MutationAdmission,
  useManageCreateAdmission,
  useManageDeleteAdmission,
  useManageUpdateAdmission,
} from "src/query/mutations";
import type { Admission } from "src/types";
import type { FieldModel } from "src/utils/jsonFields";
import { getApiErrorMessage, getApiFieldErrors } from "src/utils/apiErrors";

export interface AdmissionFormStatus {
  type: "error" | "success";
  message: string;
}

export interface AdmissionReviewItem {
  label: string;
  value: string;
}

interface AdmissionErrorItem {
  field: keyof MutationAdmission;
  label: string;
  message: string;
  targetId: string;
}

export type AdmissionFieldError = (
  field: keyof MutationAdmission,
) => string | undefined;

const ADMISSION_TIME_ZONE = "Europe/Oslo";
const UNSAVED_CHANGES_MESSAGE =
  "Du har ulagrede endringer. Vil du forlate siden uten å lagre?";
const ADMISSION_FIELD_NAMES = [
  "title",
  "slug",
  "description",
  "group_questions",
  "open_from",
  "public_deadline",
  "closed_from",
  "admin_groups",
  "groups",
] as const;
const ADMISSION_FIELD_PRESENTATION: Record<
  (typeof ADMISSION_FIELD_NAMES)[number],
  { label: string; targetId: string }
> = {
  title: { label: "Tittel", targetId: "admission-title" },
  slug: { label: "Slug", targetId: "admission-slug" },
  description: { label: "Beskrivelse", targetId: "admission-description" },
  group_questions: {
    label: "Gruppespesifikke spørsmål",
    targetId: "additional-questions-title",
  },
  open_from: { label: "Opptaket åpner", targetId: "open_from" },
  public_deadline: { label: "Søknadsfrist", targetId: "public_deadline" },
  closed_from: { label: "Opptaket stenger", targetId: "closed_from" },
  admin_groups: {
    label: "Ansvarlige opptaksgrupper",
    targetId: "admin-groups",
  },
  groups: {
    label: "Opptaksgrupper som rekrutterer",
    targetId: "admission-groups",
  },
};

const createEmptyAdmission = (): MutationAdmission => ({
  title: "",
  slug: "",
  description: "",
  group_questions: {},
  open_from: "",
  public_deadline: "",
  closed_from: "",
  admin_groups: [],
  groups: [],
});

const formatDate = (date: DateTime): string =>
  date.toFormat("yyyy-MM-dd'T'HH:mm:ss");

const formatDateString = (dateString?: string): string => {
  const date = DateTime.fromISO(dateString ?? "").setZone(ADMISSION_TIME_ZONE);
  return date.isValid ? formatDate(date) : "";
};

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

const admissionToFormValues = (admission: Admission): MutationAdmission => ({
  title: admission.title,
  slug: admission.slug,
  description: admission.description,
  group_questions: Object.fromEntries(
    admission.groups.map((group) => [group.pk, group.header_fields ?? []]),
  ),
  open_from: formatDateString(admission.open_from),
  public_deadline: formatDateString(admission.public_deadline),
  closed_from: formatDateString(admission.closed_from),
  admin_groups: admission.admin_groups?.map((group) => group.pk) ?? [],
  groups: admission.groups.map((group) => group.pk),
});

const prepareAdmissionValues = (values: MutationAdmission) => {
  const displayValues = {
    ...values,
    title: values.title.trim(),
    slug: values.slug?.trim() ?? "",
  };
  return {
    displayValues,
    requestValues: {
      ...displayValues,
      open_from: norwegianTimeToIso(displayValues.open_from) ?? "",
      public_deadline: norwegianTimeToIso(displayValues.public_deadline) ?? "",
      closed_from: norwegianTimeToIso(displayValues.closed_from) ?? "",
    },
  };
};

const admissionHasClosed = (closedFrom?: string): boolean => {
  const closedAt = DateTime.fromISO(closedFrom ?? "");
  return closedAt.isValid && closedAt.toMillis() <= DateTime.now().toMillis();
};

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
  group_questions: Yup.object().test(
    "valid-question-titles",
    "Alle spørsmål må inneholde minst 5 tegn",
    (groupQuestions) =>
      (Object.values(groupQuestions ?? {}) as FieldModel[][]).every((fields) =>
        fields.every(
          (field) => field.type === "text" || field.title.trim().length >= 5,
        ),
      ),
  ),
});

const pluralize = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`;

export const useAdmissionEditor = () => {
  const navigate = useNavigate();
  const { admissionSlug } = useParams();
  const isNew = !admissionSlug;
  const load = useManageAdmission(admissionSlug ?? "", !isNew);
  const createAdmission = useManageCreateAdmission();
  const updateAdmission = useManageUpdateAdmission();
  const deleteAdmission = useManageDeleteAdmission();
  const initializedAdmission = useRef<string>();
  const submissionInFlight = useRef(false);
  const navigationBypass = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const failedSubmissionValues = useRef<MutationAdmission>();
  const [saveStatus, setSaveStatus] = useState<AdmissionFormStatus>();
  const [deleteStatus, setDeleteStatus] = useState<AdmissionFormStatus>();
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(!isNew);

  const focusFirstInvalidField = () => {
    window.setTimeout(() => {
      const invalidField = formRef.current?.querySelector<HTMLElement>(
        '[aria-invalid="true"]',
      );
      const target =
        invalidField ?? document.getElementById("admission-error-summary");
      target?.focus();
    });
  };

  const focusField = (field: keyof MutationAdmission) => {
    const target =
      formRef.current?.querySelector<HTMLElement>(
        `[data-admission-field="${field}"]`,
      ) ??
      document.getElementById(ADMISSION_FIELD_PRESENTATION[field].targetId);
    target?.focus();
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const formik = useFormik<MutationAdmission>({
    initialValues: createEmptyAdmission(),
    validationSchema,
    validateOnMount: true,
    onSubmit: (values) => {
      if (submissionInFlight.current) return;
      submissionInFlight.current = true;
      failedSubmissionValues.current = undefined;
      setSaveStatus(undefined);
      const { displayValues, requestValues } = prepareAdmissionValues(values);

      const onSuccess = (data: AdmissionMutationResponse) => {
        submissionInFlight.current = false;
        failedSubmissionValues.current = undefined;
        formik.resetForm({ values: displayValues });
        setSaveStatus({ type: "success", message: "Opptaket er lagret." });
        if (isNew && data.slug) {
          navigationBypass.current = true;
          navigate(`/manage/${data.slug}`);
        }
      };

      const onError = (requestError: AxiosError) => {
        submissionInFlight.current = false;
        failedSubmissionValues.current = formik.values;
        formik.setSubmitting(false);
        const fieldErrors = getApiFieldErrors(
          requestError,
          ADMISSION_FIELD_NAMES,
        );
        Object.entries(fieldErrors).forEach(([field, message]) =>
          formik.setFieldError(field, message),
        );
        setSaveStatus({
          type: "error",
          message: getApiErrorMessage(
            requestError,
            "Opptaket kunne ikke lagres. Prøv igjen.",
          ),
        });
        focusFirstInvalidField();
      };

      if (isNew) {
        createAdmission.mutate(
          { admission: requestValues },
          { onSuccess, onError },
        );
      } else {
        updateAdmission.mutate(
          { slug: admissionSlug ?? "", admission: requestValues },
          { onSuccess, onError },
        );
      }
    },
  });

  const isSaving = createAdmission.isPending || updateAdmission.isPending;
  const isDeleting = deleteAdmission.isPending;
  const hasUnsavedChanges = formik.dirty && !isSaving && !isDeleting;
  const shouldBlockNavigation = useCallback(
    () => hasUnsavedChanges && !navigationBypass.current,
    [hasUnsavedChanges],
  );
  const navigationBlocker = useBlocker(shouldBlockNavigation);

  useEffect(() => {
    setSaveStatus(undefined);
    setDeleteStatus(undefined);
    initializedAdmission.current = undefined;
    navigationBypass.current = false;
    setSlugManuallyEdited(!isNew);
  }, [admissionSlug, isNew]);

  useEffect(() => {
    if (!load.data || initializedAdmission.current === load.data.slug) return;
    formik.resetForm({ values: admissionToFormValues(load.data) });
    initializedAdmission.current = load.data.slug;
  }, [load.data]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (navigationBlocker.state !== "blocked") return;
    if (window.confirm(UNSAVED_CHANGES_MESSAGE)) {
      navigationBlocker.proceed();
    } else {
      navigationBlocker.reset();
    }
  }, [navigationBlocker]);

  useEffect(() => {
    if (formik.submitCount === 0 || formik.isValid) return;
    focusFirstInvalidField();
  }, [formik.isValid, formik.submitCount]);

  useEffect(() => {
    if (formik.dirty && saveStatus?.type === "success") {
      setSaveStatus(undefined);
    }
  }, [formik.dirty, saveStatus?.type]);

  useEffect(() => {
    if (
      saveStatus?.type === "error" &&
      failedSubmissionValues.current &&
      failedSubmissionValues.current !== formik.values
    ) {
      failedSubmissionValues.current = undefined;
      setSaveStatus(undefined);
    }
  }, [formik.values, saveStatus?.type]);

  const fieldError: AdmissionFieldError = (field) => {
    const message = formik.errors[field];
    const shouldShow = formik.submitCount > 0 || Boolean(formik.touched[field]);
    return shouldShow && typeof message === "string" ? message : undefined;
  };

  const errorItems = useMemo<AdmissionErrorItem[]>(
    () =>
      formik.submitCount === 0
        ? []
        : ADMISSION_FIELD_NAMES.flatMap((field) => {
            const message = formik.errors[field];
            if (typeof message !== "string") return [];
            return [
              {
                field,
                message,
                ...ADMISSION_FIELD_PRESENTATION[field],
              },
            ];
          }),
    [formik.errors, formik.submitCount],
  );

  const updateTitle = (title: string) => {
    void formik.setFieldValue("title", title);
    if (isNew && !slugManuallyEdited) {
      void formik.setFieldValue("slug", makeSlug(title));
    }
  };

  const updateSlug = (slug: string) => {
    setSlugManuallyEdited(true);
    void formik.setFieldValue("slug", slug);
  };

  const handleDeleteAdmission = () => {
    if (!load.data || !admissionHasClosed(load.data.closed_from)) return;
    setDeleteStatus(undefined);
    deleteAdmission.mutate(
      { slug: load.data.slug },
      {
        onSuccess: () => {
          formik.resetForm();
          navigationBypass.current = true;
          navigate("/manage/");
        },
        onError: (requestError) =>
          setDeleteStatus({
            type: "error",
            message: getApiErrorMessage(
              requestError,
              "Opptaket kunne ikke slettes. Prøv igjen.",
            ),
          }),
      },
    );
  };

  const reviewItems = useMemo<AdmissionReviewItem[]>(
    () => [
      { label: "Tittel", value: formik.values.title || "Ikke satt" },
      { label: "URL", value: `/${formik.values.slug || "ikke-satt"}/` },
      { label: "Åpner", value: formatReviewDate(formik.values.open_from) },
      {
        label: "Frist",
        value: formatReviewDate(formik.values.public_deadline),
      },
      { label: "Stenger", value: formatReviewDate(formik.values.closed_from) },
      {
        label: "Tilgang",
        value: `${pluralize(
          formik.values.admin_groups.length,
          "admin-gruppe",
          "admin-grupper",
        )}, ${pluralize(
          formik.values.groups.length,
          "opptaksgruppe",
          "opptaksgrupper",
        )}`,
      },
      {
        label: "Spørsmål",
        value: pluralize(
          Object.values(formik.values.group_questions).reduce(
            (count, fields) => count + fields.length,
            0,
          ),
          "felt",
          "felt",
        ),
      },
    ],
    [formik.values],
  );

  return {
    admissionSlug,
    isNew,
    admission: load.data,
    load: {
      error: load.error,
      isLoading: load.isLoading,
      retry: load.refetch,
    },
    form: {
      formik,
      ref: formRef,
      fieldError,
      errorItems,
      focusField,
      hasUnsavedChanges,
      invalidSubmission: formik.submitCount > 0 && !formik.isValid,
      updateTitle,
      updateSlug,
    },
    save: {
      isPending: isSaving,
      status: saveStatus,
    },
    deletion: {
      canDelete: Boolean(
        load.data && admissionHasClosed(load.data.closed_from),
      ),
      isPending: isDeleting,
      status: deleteStatus,
      run: handleDeleteAdmission,
    },
    reviewItems,
  };
};
