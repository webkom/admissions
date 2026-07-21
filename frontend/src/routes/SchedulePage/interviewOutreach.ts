export interface InterviewOutreachTemplates {
  sms: {
    body: string;
  };
}

export const interviewOutreachVariables = [
  {
    token: "{first_name}",
    label: "Fornavn",
    description: "Kandidatens fornavn",
  },
  {
    token: "{full_name}",
    label: "Fullt navn",
    description: "Kandidatens fulle navn",
  },
  {
    token: "{interview_time}",
    label: "Intervjutidspunkt",
    description: "Dato og klokkeslett",
  },
  {
    token: "{admission_name}",
    label: "Opptak",
    description: "Navnet på opptaket",
  },
] as const;

export const createDefaultInterviewOutreachTemplates = (
  committeeName: string,
): InterviewOutreachTemplates => {
  const committee = committeeName.trim() || "komiteen";

  return {
    sms: {
      body: `Hei {first_name}! Du er invitert til intervju med ${committee} {interview_time}. Svar gjerne på denne meldingen for å bekrefte at tidspunktet passer. Vi ser frem til samtalen!`,
    },
  };
};

export const DEFAULT_INTERVIEW_OUTREACH_TEMPLATES =
  createDefaultInterviewOutreachTemplates("Abakus");

interface InterviewOutreachValues {
  candidateName?: string;
  candidateFullName: string;
  candidateFirstName?: string;
  admissionTitle: string;
  timeLabel: string;
  committee: string;
  panel?: string;
}

const upgradeLegacyTemplate = (
  template: string,
  committeeName: string,
): string =>
  template
    .replaceAll("{navn}", "{full_name}")
    .replaceAll("{tid}", "{interview_time}")
    .replaceAll("{komite}", committeeName)
    .replaceAll("{committee_name}", committeeName)
    .replaceAll("{committee}", committeeName)
    .replaceAll("{panel}", committeeName)
    .replaceAll("{opptak}", "{admission_name}")
    .replaceAll("{kanal}", "denne meldingen")
    .replace(/\bdenne e-posten\b/giu, "denne meldingen")
    .replace(/\be-posten\b/giu, "meldingen")
    .replace(/\be-post\b/giu, "melding");

const migrateLegacyBody = (
  template: string,
  committeeName: string,
): InterviewOutreachTemplates => ({
  sms: {
    body: upgradeLegacyTemplate(template, committeeName),
  },
});

export const normalizeStoredOutreachTemplates = (
  raw: string | null | undefined,
  committeeName = "Abakus",
): InterviewOutreachTemplates => {
  const defaultTemplates =
    createDefaultInterviewOutreachTemplates(committeeName);
  if (!raw) return defaultTemplates;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return typeof parsed === "string"
        ? migrateLegacyBody(parsed, committeeName)
        : defaultTemplates;
    }

    if (
      "sms" in parsed &&
      typeof parsed.sms === "object" &&
      parsed.sms !== null &&
      "body" in parsed.sms &&
      typeof parsed.sms.body === "string"
    ) {
      return {
        sms: {
          body: upgradeLegacyTemplate(parsed.sms.body, committeeName),
        },
      };
    }

    if ("template" in parsed && typeof parsed.template === "string") {
      return migrateLegacyBody(parsed.template, committeeName);
    }

    if ("emailTemplate" in parsed && typeof parsed.emailTemplate === "string") {
      return {
        sms: {
          body:
            "smsTemplate" in parsed && typeof parsed.smsTemplate === "string"
              ? upgradeLegacyTemplate(parsed.smsTemplate, committeeName)
              : upgradeLegacyTemplate(parsed.emailTemplate, committeeName),
        },
      };
    }
  } catch {
    return migrateLegacyBody(raw, committeeName);
  }

  return defaultTemplates;
};

const supportedTokens = new Set<string>([
  ...interviewOutreachVariables.map(({ token }) => token),
  "{navn}",
  "{tid}",
  "{komite}",
  "{kanal}",
  "{opptak}",
  "{panel}",
  "{committee}",
]);

export const findUnknownInterviewOutreachTokens = (
  template: string,
): string[] =>
  Array.from(new Set(template.match(/\{[^{}\r\n]+\}/g) ?? [])).filter(
    (token) => !supportedTokens.has(token),
  );

export const renderInterviewOutreachTemplate = (
  template: string,
  values: InterviewOutreachValues,
): string => {
  const candidateFullName =
    values.candidateFullName || values.candidateName || "";
  const candidateFirstName =
    values.candidateFirstName ||
    candidateFullName.trim().split(" ").filter(Boolean)[0] ||
    "";
  const committee = values.committee || values.panel || "Abakus";
  const channelPhrase = "denne meldingen";

  return template
    .replaceAll("{navn}", candidateFullName)
    .replaceAll("{full_name}", candidateFullName)
    .replaceAll("{first_name}", candidateFirstName)
    .replaceAll("{tid}", values.timeLabel)
    .replaceAll("{interview_time}", values.timeLabel)
    .replaceAll("{komite}", committee)
    .replaceAll("{committee_name}", committee)
    .replaceAll("{kanal}", channelPhrase)
    .replaceAll("{opptak}", values.admissionTitle)
    .replaceAll("{admission_name}", values.admissionTitle)
    .replaceAll("{panel}", committee)
    .replaceAll("{committee}", committee);
};
