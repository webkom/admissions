import React from "react";
import { DateTime } from "luxon";
import { Formik, FormikHelpers } from "formik";
import * as Yup from "yup";
import {
  MutationApplication,
  useCreateApplicationMutation,
} from "src/query/mutations";
import { isSensitiveAuthorityChangedError } from "src/query/sensitiveAccess";
import { getApiErrorMessage } from "src/utils/apiErrors";

import {
  getApplictionTextDrafts,
  getGroupAnswersDraft,
  getDraftUpdatedAt,
  clearAllDrafts,
  getSavedPhoneNumber,
  getPhoneNumberDraft,
  getPriorityTextDraft,
  saveSubmittedPhoneNumber,
} from "src/utils/draftHelper";
import ConfirmDialog from "src/components/Scheduling/ConfirmDialog";
import UnsavedDraftBanner from "./UnsavedDraftBanner";
import { DraftWriteGateProvider } from "src/utils/draftWriteGate";
import DraftAnswersAutosave from "./DraftAnswersAutosave";
import { Admission, Application, Group } from "src/types";
import FormContainer from "./FormContainer";
import { InputFieldModel, InputResponseModel } from "src/utils/jsonFields";
import djangoData from "src/utils/djangoData";

export type SelectedGroups = { [key: string]: boolean };

export type FormValues = {
  phoneNumber: string;
  priorityText: string;
  groupAnswers: Record<string, InputResponseModel>;
  groups: { [groupName: string]: string };
};

export type SharedApplicationProps = {
  toggleIsEditing: () => void;
  myApplication?: Application;
  selectedGroups: SelectedGroups;
  toggleGroup: (groupName: string) => void;
  admission?: Admission;
  groups: Group[];
};

const generateInitialValues: (
  selectedGroups: SelectedGroups,
  userId: string,
  admission?: Admission,
  myApplication?: Application,
  // When true the local draft wins over the submitted application. Without it
  // a present myApplication shadows every draft, because destructuring
  // defaults only fire on undefined — which silently discarded unsaved edits.
  preferDraft?: boolean,
) => FormValues = (
  selectedGroups,
  userId,
  admission,
  myApplication,
  preferDraft = false,
) => {
  const savedPhoneNumber = getSavedPhoneNumber(userId);
  const {
    phone_number: phoneNumber = getPhoneNumberDraft(savedPhoneNumber),
    priority_text: priorityText = getPriorityTextDraft(),
    group_applications: groupApplications = getApplictionTextDrafts(),
  } = preferDraft ? {} : myApplication || {};

  const initialValues: FormValues = {
    phoneNumber,
    priorityText,
    groupAnswers: {},
    groups: {},
  };

  const formattedGroupApplications: FormValues["groups"] = {};
  Object.keys(selectedGroups).forEach((group) => {
    formattedGroupApplications[group] = "";
  });

  const blankGroupAnswers = (group: Group): InputResponseModel =>
    (group.header_fields ?? [])
      .filter((field): field is InputFieldModel => "id" in field)
      .reduce(
        (answers, field) => ({
          ...answers,
          [field.id]: field.type === "checkbox" ? false : "",
        }),
        {},
      );
  initialValues.groupAnswers = Object.fromEntries(
    (admission?.groups ?? [])
      .filter((group) => selectedGroups[group.name.toLowerCase()])
      .map((group) => [group.name.toLowerCase(), blankGroupAnswers(group)]),
  );

  // The group applications are already formatted in the object form Formik likes
  if (!Array.isArray(groupApplications)) {
    initialValues.groups = {
      ...formattedGroupApplications,
      ...groupApplications,
    };
    // Restore the per-committee answers too. These were persisted nowhere
    // before, so they were lost on every reload even when the texts survived.
    const answerDrafts = getGroupAnswersDraft();
    initialValues.groupAnswers = Object.fromEntries(
      Object.entries(initialValues.groupAnswers).map(([groupName, blank]) => [
        groupName,
        { ...blank, ...(answerDrafts[groupName] ?? {}) },
      ]),
    );
    return initialValues;
  }

  // The group applications are formatted in the array that Django/Postgres likes
  groupApplications.forEach((application) => {
    const groupName = application.group.name.toLowerCase();
    formattedGroupApplications[groupName] = application.text;
    initialValues.groupAnswers[groupName] =
      application.header_fields_response ?? {};
  });

  initialValues.groups = formattedGroupApplications;
  return initialValues;
};

const validationSchema = (
  selectedGroups: SelectedGroups,
  admission?: Admission,
) => {
  return Yup.lazy(() => {
    // Iterate over all selected groups and add them to the required schema
    const selectedGroupsSchema: { [x: string]: Yup.StringSchema } = {};
    Object.entries(selectedGroups)
      .filter(
        ([groupName, isSelected]) =>
          isSelected &&
          admission?.groups.some(
            (group) => group.name.toLowerCase() === groupName,
          ),
      )
      .forEach(
        ([groupName]) =>
          (selectedGroupsSchema[groupName] = Yup.string().required(
            "Søknadsteksten må fylles ut",
          )),
      );

    const groupAnswersSchema = Object.fromEntries(
      (admission?.groups ?? [])
        .filter((group) => selectedGroups[group.name.toLowerCase()])
        .map((group) => {
          const requiredFields = (group.header_fields ?? [])
            .filter(
              (field): field is InputFieldModel =>
                "id" in field && field.required,
            )
            .reduce(
              (fields, field) => {
                fields[field.id] =
                  field.type === "checkbox"
                    ? Yup.boolean().oneOf(
                        [true],
                        `${field.title} må krysses av`,
                      )
                    : Yup.string().required(`${field.title} må fylles ut`);
                return fields;
              },
              {} as Record<string, Yup.BooleanSchema | Yup.StringSchema>,
            );
          return [group.name.toLowerCase(), Yup.object().shape(requiredFields)];
        }),
    );

    return Yup.object().shape({
      phoneNumber: Yup.string()
        .matches(
          /^(0047|\+47|47)?(?:\s*\d){8}$/,
          "Skriv inn et gyldig norsk telefonnummer",
        )
        .required("Skriv inn et gyldig norsk telefonnummer"),
      priorityText: Yup.string().max(
        5000,
        "Prioriteringer kan ikke være lengre enn 5000 tegn",
      ),
      groupAnswers: Yup.object().shape(groupAnswersSchema),
      groups: Yup.object().shape(selectedGroupsSchema),
    });
  });
};

type ApplicationFormProps = SharedApplicationProps;

// Highest order component for application form.
// Handles form values, submit post and form validation.
// JSON.stringify is key-order sensitive, and the two sides of the draft
// comparison below are built from different sources: groupAnswers is
// assembled in header_fields display order, while header_fields_response
// comes back from Postgres as jsonb, which returns its uuid keys reordered.
// Comparing the raw strings therefore reported a difference between values
// that were identical, and since the check runs once on mount that pinned
// the "Du har ulagrede endringer" banner open for good. Ordering keys at
// every level makes the comparison about content only.
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
};

const sameContent = (left: unknown, right: unknown) =>
  JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));

const ApplicationForm: React.FC<ApplicationFormProps> = ({
  myApplication,
  selectedGroups,
  toggleGroup,
  toggleIsEditing,
  admission,
  groups,
}) => {
  const createApplicationMutation = useCreateApplicationMutation(
    admission?.slug ?? "",
  );
  const currentUserId = djangoData.user.id ?? "";

  // Resolved once, on mount. Reading storage on every render would let a
  // re-render landing inside the save debounce revert recent keystrokes,
  // because Formik runs with enableReinitialize.
  const [pendingDraftAt] = React.useState<string | null>(() => {
    const draftAt = getDraftUpdatedAt();
    if (!draftAt || !myApplication?.updated_at) return null;
    if (
      DateTime.fromISO(draftAt) <= DateTime.fromISO(myApplication.updated_at)
    ) {
      return null;
    }
    // A newer draftUpdatedAt isn't proof of a real edit - several mount-time
    // writers (autosave, group-answer editors) can stamp it without the
    // content actually differing from what's already submitted. Only surface
    // the banner when restoring the draft would change something.
    const draftValues = generateInitialValues(
      selectedGroups,
      currentUserId,
      admission,
      myApplication,
      true,
    );
    const submittedValues = generateInitialValues(
      selectedGroups,
      currentUserId,
      admission,
      myApplication,
      false,
    );
    return sameContent(draftValues, submittedValues) ? null : draftAt;
  });
  const [draftChoice, setDraftChoice] = React.useState<
    "undecided" | "restored" | "discarded"
  >("undecided");
  const [submitError, setSubmitError] = React.useState("");
  const [pendingWithdrawal, setPendingWithdrawal] = React.useState<{
    values: FormValues;
  } | null>(null);
  const showDraftBanner =
    pendingDraftAt !== null && draftChoice === "undecided";
  const preferDraft = draftChoice === "restored";

  const initialValues = React.useMemo(
    () =>
      generateInitialValues(
        selectedGroups,
        currentUserId,
        admission,
        myApplication,
        preferDraft,
      ),
    [selectedGroups, currentUserId, admission, myApplication, preferDraft],
  );

  // Committees the applicant applied to and has now unticked. Deliberately not
  // intersected with admission.groups: the backend derives what to keep purely
  // from the payload, so a group since removed from the admission would still
  // be deleted but would vanish from this warning.
  const withdrawnGroups = (myApplication?.group_applications ?? [])
    .map((application) => application.group)
    .filter((group) => !selectedGroups[group.name.toLowerCase()]);

  const buildSubmission = (values: FormValues): MutationApplication => {
    const submission: MutationApplication = {
      applications: {},
      phone_number: values.phoneNumber,
      priority_text: values.priorityText,
      group_answers: {},
    };
    Object.keys(values.groups)
      .filter(
        (groupName) =>
          selectedGroups[groupName] &&
          admission?.groups.some(
            (group) => group.name.toLowerCase() === groupName,
          ),
      )
      .forEach((name) => {
        submission.applications[name] = values.groups[name];
        submission.group_answers[name] = values.groupAnswers[name] ?? {};
      });
    return submission;
  };

  const performSubmit = (
    values: FormValues,
    setSubmitting: (isSubmitting: boolean) => void,
  ) => {
    const submission = buildSubmission(values);
    setSubmitError("");
    createApplicationMutation.mutate(
      { newApplication: submission },
      {
        onSuccess: () => {
          saveSubmittedPhoneNumber(currentUserId, values.phoneNumber);
          clearAllDrafts();
          setSubmitting(false);
          toggleIsEditing();
        },
        onError: (error) => {
          setSubmitting(false);
          if (isSensitiveAuthorityChangedError(error)) {
            // Writes stay latched off for the rest of this tab, so without a
            // message the applicant can press submit forever in silence.
            setSubmitError(
              "Innloggingen har utløpt. Det du har skrevet er lagret — last siden på nytt og logg inn igjen for å sende inn.",
            );
            return;
          }
          setSubmitError(
            getApiErrorMessage(
              error,
              "Kunne ikke sende inn søknaden. Prøv igjen.",
            ),
          );
        },
      },
    );
  };

  const onSubmit: (
    values: FormValues,
    formikHelpers: FormikHelpers<FormValues>,
  ) => void = (values, { setSubmitting }) => {
    if (withdrawnGroups.length > 0) {
      // Submitting is what destroys the text and mails the committee, so the
      // confirmation belongs here rather than on the untick, which is
      // reversible and reachable from two different controls.
      // Releasing the submitting flag first, or the button stays disabled
      // behind the dialog and cancelling leaves a dead form.
      setSubmitting(false);
      setPendingWithdrawal({ values });
      return;
    }
    performSubmit(values, setSubmitting);
  };

  return (
    <>
      {showDraftBanner && pendingDraftAt && (
        <UnsavedDraftBanner
          draftUpdatedAt={pendingDraftAt}
          onRestore={() => setDraftChoice("restored")}
          onDiscard={() => {
            clearAllDrafts();
            setDraftChoice("discarded");
          }}
        />
      )}
      {pendingWithdrawal && (
        <ConfirmDialog
          tone="danger"
          title={
            withdrawnGroups.length === 1
              ? `Trekke søknaden til ${withdrawnGroups[0].name}?`
              : `Trekke søknaden til ${withdrawnGroups.length} komiteer?`
          }
          confirmLabel={
            withdrawnGroups.length === 1
              ? "Send inn og trekk søknaden"
              : "Send inn og trekk søknadene"
          }
          onClose={() => setPendingWithdrawal(null)}
          onConfirm={() => {
            const { values } = pendingWithdrawal;
            setPendingWithdrawal(null);
            performSubmit(values, () => undefined);
          }}
        >
          <div data-cy="withdraw-confirm">
            <p>
              Du har fjernet{" "}
              <strong>
                {withdrawnGroups.map((group) => group.name).join(", ")}
              </strong>{" "}
              fra søknaden din. Når du sender inn nå, blir søknadsteksten din
              til{" "}
              {withdrawnGroups.length === 1
                ? "denne komiteen"
                : "disse komiteene"}{" "}
              slettet for godt, og verken du eller komiteen kan hente den
              tilbake.
            </p>
            <p>Søknadene dine til de andre komiteene beholdes.</p>
          </div>
        </ConfirmDialog>
      )}
      {submitError && (
        <div
          role="alert"
          data-cy="submit-error"
          className="mb-4 rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-ui font-semibold text-danger"
        >
          {submitError}
        </div>
      )}
      <DraftWriteGateProvider value={!showDraftBanner}>
        <Formik<FormValues>
          initialValues={initialValues}
          validateOnChange={true}
          validateOnMount={true}
          enableReinitialize={true}
          validationSchema={validationSchema(selectedGroups, admission)}
          onSubmit={onSubmit}
        >
          {
            (formikProps) => (
              <>
                <DraftAnswersAutosave />
                <FormContainer
                  admission={admission}
                  groups={groups}
                  selectedGroups={selectedGroups}
                  toggleGroup={toggleGroup}
                  toggleIsEditing={toggleIsEditing}
                  myApplication={myApplication}
                  handleSubmit={formikProps.handleSubmit}
                  touched={formikProps.touched}
                  errors={formikProps.errors}
                  isSubmitting={formikProps.isSubmitting}
                  isValid={formikProps.isValid}
                />
              </>
            )
            // https://formik.org/docs/api/formik#props-1
          }
        </Formik>
      </DraftWriteGateProvider>
    </>
  );
};

export default ApplicationForm;
