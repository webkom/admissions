export const encodeSmsAddress = (phoneNumber: string): string => {
  const trimmed = phoneNumber.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return trimmed.startsWith("+") ? `+${digits}` : digits;
};
