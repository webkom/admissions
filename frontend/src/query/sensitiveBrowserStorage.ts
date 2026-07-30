const OUTREACH_TEMPLATE_SUFFIX = ":interview-outreach-template";

type SensitiveStorage = Pick<Storage, "key" | "length" | "removeItem">;

export const buildInterviewOutreachTemplateStorageKey = (
  admissionSlug: string,
  actorId: string,
  committeeScopeId: string,
) =>
  `admissions:${admissionSlug}:actor:${actorId}:committee:${committeeScopeId}${OUTREACH_TEMPLATE_SUFFIX}`;

const isOutreachTemplateStorageKey = (key: string) =>
  key.startsWith("admissions:") && key.endsWith(OUTREACH_TEMPLATE_SUFFIX);

const removeMatchingKeys = (
  matches: (key: string) => boolean,
  storage?: SensitiveStorage,
) => {
  try {
    const browserStorage = storage ?? window.localStorage;
    const matchingKeys = Array.from(
      { length: browserStorage.length },
      (_, index) => browserStorage.key(index),
    ).filter((key): key is string => key !== null && matches(key));
    matchingKeys.forEach((key) => browserStorage.removeItem(key));
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
};

export const clearSensitiveAdmissionBrowserStorage = (
  admissionSlug: string,
  storage?: SensitiveStorage,
) => {
  const admissionPrefix = `admissions:${admissionSlug}:`;
  removeMatchingKeys(
    (key) =>
      key.startsWith(admissionPrefix) && isOutreachTemplateStorageKey(key),
    storage,
  );
};

export const clearAllSensitiveBrowserStorage = (storage?: SensitiveStorage) => {
  removeMatchingKeys(isOutreachTemplateStorageKey, storage);
};
