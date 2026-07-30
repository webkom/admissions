import { AxiosError } from "axios";

type ErrorPayload = Record<string, unknown>;

const firstMessage = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(firstMessage).find((message) => Boolean(message));
  }
  if (value && typeof value === "object") {
    return Object.values(value as ErrorPayload)
      .map(firstMessage)
      .find((message) => Boolean(message));
  }
  return undefined;
};

export const getApiFieldErrors = (
  error: AxiosError,
  fields: readonly string[],
): Record<string, string> => {
  const data = error.response?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};

  const payload = data as ErrorPayload;
  return Object.fromEntries(
    fields.flatMap((field) => {
      const message = firstMessage(payload[field]);
      return message ? [[field, message]] : [];
    }),
  );
};

export const getApiErrorMessage = (
  error: AxiosError,
  fallback: string,
): string => {
  if (error.code === "ECONNABORTED") {
    return "Forespørselen tok for lang tid. Kontroller forbindelsen og prøv igjen.";
  }
  if (!error.response) {
    return "Kunne ikke kontakte serveren. Kontroller forbindelsen og prøv igjen.";
  }

  switch (error.response.status) {
    case 400:
      return "Noen av opplysningene er ugyldige. Kontroller feltene nedenfor.";
    case 401:
      return "Innloggingen har utløpt. Last siden på nytt og logg inn igjen.";
    case 403:
      return "Du har ikke tilgang til å utføre denne handlingen.";
    case 404:
      return "Opptaket finnes ikke lenger.";
    case 409:
      return "Opptaket ble endret av noen andre. Last siden på nytt før du prøver igjen.";
    case 429:
      return "For mange forespørsler på kort tid. Vent litt og prøv igjen.";
    default:
      return fallback;
  }
};
