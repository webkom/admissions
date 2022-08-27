import { useEffect } from "react";

// Debounced hook
export const useDebouncedDraftUpdate = (updateMethod, value, timeout = 500) => {
  useEffect(() => {
    updateMethod(value);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => updateMethod(value), timeout);
    return () => clearTimeout(timer);
  }, [value]);
};

// Update/fetch methods
const keys = {
  applicationText: "applicationText",
  selectedGroups: "selectedGroups",
  isEditingApplication: "isEditingApplication",
  priorityText: "priorityText",
  phoneNumber: "phoneNumber",
};

const getItem = (key, defaultValue = '""') =>
  sessionStorage.getItem(key) ?? defaultValue;
const getParsedJson = (key, defaultValue = '""') => {
  return JSON.parse(getItem(key, defaultValue));
};
const saveObject = (key, value) => {
  const previousValue = getItem(key);
  sessionStorage.setItem(key, JSON.stringify(value));
  if (JSON.stringify(value) === previousValue) return;
  sessionStorage.setItem("updated_at", new Date().toJSON());
};

export const clearAllDrafts = () => sessionStorage.clear();

export const getDraftUpdatedAt = () => new Date(getItem("updated_at"));

// key-specific methods
export const saveApplicationTextDraft = ([groupName, applicationText]) => {
  saveObject(keys.applicationText, {
    ...getParsedJson(keys.applicationText, []),
    [groupName.toLowerCase()]: applicationText,
  });
};

export const getApplictionTextDrafts = () =>
  getParsedJson(keys.applicationText);

export const saveSelectedGroupsDraft = (selectedGroups) =>
  saveObject(keys.selectedGroups, selectedGroups);

export const getSelectedGroupsDraft = () => getParsedJson(keys.selectedGroups);

export const savePriorityTextDraft = (priorityText) =>
  saveObject(keys.priorityText, priorityText);

export const getPriorityTextDraft = () => getParsedJson(keys.priorityText);

export const savePhoneNumberDraft = (phoneNumber) =>
  saveObject(keys.phoneNumber, phoneNumber);

export const getPhoneNumberDraft = (defaultValue = null) =>
  getParsedJson(keys.phoneNumber) || defaultValue;
