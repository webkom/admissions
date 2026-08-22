enum KeyType {
  applicationText,
  priorityText,
  selectedGroups,
  phoneNumber,
  groupAnswers,
  draftUpdatedAt,
}

const DRAFT_PREFIX = "admissions.applicationDraft";
const SAVED_PHONE_PREFIX = "admissions.savedPhoneNumber";
let draftScope = "unscoped";

/**
 * Drafts live in localStorage, not sessionStorage.
 *
 * SESSION_EXPIRE_AT_BROWSER_CLOSE means a closed tab ends the session, and with
 * sessionStorage it also destroyed the only copy of anything typed. Losing an
 * hour of writing is both worse and far likelier than the residue risk on a
 * shared machine, which the per-user prune below already limits.
 */
const draftStore = (): Storage => localStorage;

const savedPhoneNumberKey = (userId: string) =>
  `${SAVED_PHONE_PREFIX}.${encodeURIComponent(userId || "anonymous")}`;

export const createDraftAdmissionScope = (
  admissionSlug: string,
  userId: string,
) =>
  `${encodeURIComponent(userId || "anonymous")}.${encodeURIComponent(
    admissionSlug || "unscoped",
  )}`;

export const setDraftAdmissionScope = (
  admissionSlug: string,
  userId: string,
) => {
  const admission = encodeURIComponent(admissionSlug || "unscoped");
  const userPrefix = `${DRAFT_PREFIX}.${encodeURIComponent(
    userId || "anonymous",
  )}.`;
  const legacyPrefix = `${DRAFT_PREFIX}.${admission}.`;
  draftScope = createDraftAdmissionScope(admissionSlug, userId);
  try {
    // Carry any draft written before the move to localStorage across, so a
    // deploy mid-application does not throw away what someone was typing.
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(`${DRAFT_PREFIX}.`))
      .forEach((key) => {
        const carried = sessionStorage.getItem(key);
        if (carried !== null && localStorage.getItem(key) === null) {
          localStorage.setItem(key, carried);
        }
        sessionStorage.removeItem(key);
      });
  } catch {
    // A hardened context may deny one store but not the other; keep going.
  }
  try {
    Object.keys(draftStore())
      .filter(
        (key) =>
          key.startsWith(legacyPrefix) ||
          (key.startsWith(`${DRAFT_PREFIX}.`) && !key.startsWith(userPrefix)) ||
          // The saved phone number is drafted PII under its own prefix, so
          // the draft-prefix filters above never reached it and it outlived
          // every actor change. On a shared machine that left the previous
          // applicant's number readable by whoever logged in next.
          (key.startsWith(`${SAVED_PHONE_PREFIX}.`) &&
            key !== savedPhoneNumberKey(userId)),
      )
      .forEach((key) => draftStore().removeItem(key));
  } catch {
    return;
  }
};

const storageKey = (key: KeyType, scope = draftScope) =>
  `${DRAFT_PREFIX}.${scope}.${KeyType[key]}`;

const getItem = (key: KeyType, defaultValue = '""', scope = draftScope) => {
  try {
    return draftStore().getItem(storageKey(key, scope)) ?? defaultValue;
  } catch {
    return defaultValue;
  }
};
const getParsedJson = (
  key: KeyType,
  defaultValue: string | boolean | null | [] = "",
  scope = draftScope,
) => {
  try {
    return JSON.parse(getItem(key, JSON.stringify(defaultValue), scope));
  } catch {
    return defaultValue;
  }
};
const saveObject = (
  key: KeyType,
  value: string | boolean | SelectedGroupsDraft | GroupAnswersDraft,
) => {
  if (value === undefined) {
    value = "";
  }
  try {
    const serialized = JSON.stringify(value);
    // Writing back an unchanged value must not stamp a new timestamp. Every
    // debounced autosave fires once on mount (useDebouncedState seeds
    // synchronously), so without this the app reports unsaved changes purely
    // for having loaded. Any future autosave gets the same protection.
    if (draftStore().getItem(storageKey(key)) === serialized) return;
    draftStore().setItem(storageKey(key), serialized);
    if (key !== KeyType.draftUpdatedAt) {
      draftStore().setItem(
        storageKey(KeyType.draftUpdatedAt),
        JSON.stringify(new Date().toISOString()),
      );
    }
  } catch {
    return;
  }
};

/** ISO timestamp of the most recent local draft write, or null if none. */
export const getDraftUpdatedAt = (): string | null => {
  const stored = getParsedJson(KeyType.draftUpdatedAt, null);
  return typeof stored === "string" && stored ? stored : null;
};

export const clearAllDrafts = () => {
  const prefix = `${DRAFT_PREFIX}.${draftScope}.`;
  try {
    Object.keys(draftStore())
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => draftStore().removeItem(key));
  } catch {
    return;
  }
};

export const clearApplicationDraftNamespace = () => {
  try {
    Object.keys(draftStore())
      .filter(
        (key) =>
          key.startsWith(`${DRAFT_PREFIX}.`) ||
          // Logging out is the point at which someone hands the machine back,
          // so the saved phone number goes too - it is the applicant's own
          // PII and nothing after logout has any use for it.
          key.startsWith(`${SAVED_PHONE_PREFIX}.`),
      )
      .forEach((key) => draftStore().removeItem(key));
  } catch {
    return;
  }
};

export const saveApplicationTextDraft = ([groupName, applicationText]: [
  string,
  string,
]) => {
  saveObject(KeyType.applicationText, {
    ...getParsedJson(KeyType.applicationText, []),
    [groupName.toLowerCase()]: applicationText,
  });
};

export const getApplictionTextDrafts: () => Record<string, string> = () =>
  getParsedJson(KeyType.applicationText);

export const savePriorityTextDraft = (priorityText: string) =>
  saveObject(KeyType.priorityText, priorityText);

export const getPriorityTextDraft = () =>
  getParsedJson(KeyType.priorityText, "");

interface SelectedGroupsDraft {
  [key: string]: boolean;
}

/**
 * Per-committee answers, keyed by lowercased group name. The value type mirrors
 * InputResponseModel in utils/jsonFields so a restored draft can be merged into
 * Formik's values without a cast.
 */
interface GroupAnswersDraft {
  [groupName: string]: Record<string, string | boolean>;
}

export const saveGroupAnswersDraft = (groupAnswers: GroupAnswersDraft) =>
  saveObject(KeyType.groupAnswers, groupAnswers);

export const getGroupAnswersDraft = (): GroupAnswersDraft =>
  getParsedJson(KeyType.groupAnswers, "") || {};

export const saveSelectedGroupsDraft = (selectedGroups: SelectedGroupsDraft) =>
  saveObject(KeyType.selectedGroups, selectedGroups);

export const getSelectedGroupsDraft = (
  scope?: string,
): SelectedGroupsDraft | null => {
  const stored = getParsedJson(KeyType.selectedGroups, "", scope ?? draftScope);
  // null distinguishes "no draft was ever written" from "the applicant
  // deliberately unticked everything", which the caller must not conflate.
  // A corrupted entry degrades to null rather than crashing a consumer that
  // calls Object.values on it.
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return null;
  }
  const entries = Object.entries(stored as Record<string, unknown>);
  if (entries.some(([, value]) => typeof value !== "boolean")) return null;
  return Object.fromEntries(entries) as SelectedGroupsDraft;
};

export const savePhoneNumberDraft = (phoneNumber: string) =>
  saveObject(KeyType.phoneNumber, phoneNumber);

export const getPhoneNumberDraft = (defaultValue = "") => {
  try {
    const stored = draftStore().getItem(storageKey(KeyType.phoneNumber));
    return stored === null ? defaultValue : (JSON.parse(stored) as string);
  } catch {
    return defaultValue;
  }
};

export const saveSubmittedPhoneNumber = (
  userId: string,
  phoneNumber: string,
) => {
  const trimmedPhoneNumber = phoneNumber.trim();
  if (!trimmedPhoneNumber) return;
  try {
    localStorage.setItem(
      savedPhoneNumberKey(userId),
      JSON.stringify(trimmedPhoneNumber),
    );
  } catch {
    return;
  }
};

export const getSavedPhoneNumber = (userId: string, defaultValue = "") => {
  try {
    const stored = localStorage.getItem(savedPhoneNumberKey(userId));
    return stored === null ? defaultValue : (JSON.parse(stored) as string);
  } catch {
    return defaultValue;
  }
};
