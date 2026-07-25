enum KeyType {
  applicationText,
  priorityText,
  selectedGroups,
  isEditingApplication,
  phoneNumber,
}

const DRAFT_PREFIX = "admissions.applicationDraft";
const SAVED_PHONE_PREFIX = "admissions.savedPhoneNumber";
let draftScope = "unscoped";

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
    Object.keys(sessionStorage)
      .filter(
        (key) =>
          key.startsWith(legacyPrefix) ||
          (key.startsWith(`${DRAFT_PREFIX}.`) && !key.startsWith(userPrefix)),
      )
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    return;
  }
};

const storageKey = (key: KeyType, scope = draftScope) =>
  `${DRAFT_PREFIX}.${scope}.${KeyType[key]}`;

const getItem = (key: KeyType, defaultValue = '""', scope = draftScope) => {
  try {
    return sessionStorage.getItem(storageKey(key, scope)) ?? defaultValue;
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
  value: string | boolean | SelectedGroupsDraft,
) => {
  if (value === undefined) {
    value = "";
  }
  try {
    sessionStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    return;
  }
};

export const clearAllDrafts = () => {
  const prefix = `${DRAFT_PREFIX}.${draftScope}.`;
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    return;
  }
};

export const clearApplicationDraftNamespace = () => {
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(`${DRAFT_PREFIX}.`))
      .forEach((key) => sessionStorage.removeItem(key));
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

export const saveSelectedGroupsDraft = (selectedGroups: SelectedGroupsDraft) =>
  saveObject(KeyType.selectedGroups, selectedGroups);

export const getSelectedGroupsDraft = (scope?: string): SelectedGroupsDraft =>
  getParsedJson(KeyType.selectedGroups, "", scope ?? draftScope);

export const savePhoneNumberDraft = (phoneNumber: string) =>
  saveObject(KeyType.phoneNumber, phoneNumber);

export const getPhoneNumberDraft = (defaultValue = "") => {
  try {
    const stored = sessionStorage.getItem(storageKey(KeyType.phoneNumber));
    return stored === null ? defaultValue : (JSON.parse(stored) as string);
  } catch {
    return defaultValue;
  }
};

const savedPhoneNumberKey = (userId: string) =>
  `${SAVED_PHONE_PREFIX}.${encodeURIComponent(userId || "anonymous")}`;

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

export const saveIsEditingDraft = (newValue: boolean) =>
  saveObject(KeyType.isEditingApplication, newValue);

export const getIsEditingDraft = (defaultValue: boolean | null = null) =>
  getParsedJson(KeyType.isEditingApplication, defaultValue);
