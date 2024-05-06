// Update/fetch methods
enum KeyType {
  applicationText,
  selectedGroups,
  isEditingApplication,
  priorityText,
  phoneNumber,
}

const getItem = (key: KeyType, defaultValue = '""') =>
  sessionStorage.getItem(KeyType[key]) ?? defaultValue;
const getParsedJson = (
  key: KeyType,
  defaultValue: string | boolean | null | [] = "",
) => {
  return JSON.parse(getItem(key, JSON.stringify(defaultValue)));
};
const saveObject = (
  key: KeyType,
  value: string | boolean | SelectedGroupsDraft,
) => {
  if (value === undefined) {
    value = "";
  }
  sessionStorage.setItem(KeyType[key], JSON.stringify(value));
};

export const clearAllDrafts = () => sessionStorage.clear();

// key-specific methods
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

interface SelectedGroupsDraft {
  [key: string]: boolean;
}

export const saveSelectedGroupsDraft = (selectedGroups: SelectedGroupsDraft) =>
  saveObject(KeyType.selectedGroups, selectedGroups);

export const getSelectedGroupsDraft: () => SelectedGroupsDraft = () =>
  getParsedJson(KeyType.selectedGroups);

export const savePriorityTextDraft = (priorityText: string) =>
  saveObject(KeyType.priorityText, priorityText);

export const getPriorityTextDraft = () => getParsedJson(KeyType.priorityText);

export const savePhoneNumberDraft = (phoneNumber: string) =>
  saveObject(KeyType.phoneNumber, phoneNumber);

export const getPhoneNumberDraft = (defaultValue = "") =>
  getParsedJson(KeyType.phoneNumber) || defaultValue;

export const saveIsEditingDraft = (newValue: boolean) =>
  saveObject(KeyType.isEditingApplication, newValue);

export const getIsEditingDraft = (defaultValue: boolean | null = null) =>
  getParsedJson(KeyType.isEditingApplication, defaultValue);
