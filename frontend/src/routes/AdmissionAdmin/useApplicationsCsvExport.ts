import { useMemo } from "react";
import { DateTime } from "luxon";

import type { AdminApplication, Admission, Group } from "src/types";
import type { FieldModel, InputFieldModel } from "src/utils/jsonFields";
import { isFullAdminApplication } from "src/utils/applicationAccess";
import { escapeCsvCell } from "src/utils/methods";
import type { CompleteCsvData } from "src/routes/AdmissionAdmin/components/CSVExportHandler";

/**
 * Committee-scoped users (leader/recruiter) see their own committee's
 * applicants. The backend deliberately withholds e-mail, username and
 * priority text from them, but the application text and the committee's own
 * custom header questions are theirs - so export those too.
 */
const headerFieldLabel = (field: FieldModel): string =>
  field.type === "text" ? "" : field.label || field.title;

const isAnswerableHeaderField = (field: FieldModel): field is InputFieldModel =>
  field.type !== "text";

const CSV_TIME_ZONE = "Europe/Oslo";

const formatCsvDate = (value: string): string => {
  const date = DateTime.fromISO(value).setZone(CSV_TIME_ZONE);
  return date.isValid ? date.setLocale("nb").toFormat("dd.MM.yyyy HH:mm") : "";
};

const filenamePart = (value: string): string =>
  value
    .toLocaleLowerCase("nb-NO")
    .replaceAll("ø", "o")
    .replaceAll("æ", "ae")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

interface ApplicationsCsvExport {
  showGroupColumn: boolean;
  csvHeaders: { label: string; key: string }[];
  exportCsvData: CompleteCsvData[];
  exportFilename: string;
}

interface UseApplicationsCsvExportArgs {
  filteredApplications: AdminApplication[];
  admission: Admission | undefined;
  isCommitteeMinimal: boolean;
  activeGroupIds: string[];
  availableGroups: Group[];
}

export const useApplicationsCsvExport = ({
  filteredApplications,
  admission,
  isCommitteeMinimal,
  activeGroupIds,
  availableGroups,
}: UseApplicationsCsvExportArgs): ApplicationsCsvExport => {
  const showGroupColumn = useMemo(
    () =>
      isCommitteeMinimal ||
      new Set(
        filteredApplications.flatMap((application) =>
          application.group_applications.map(
            (groupApplication) => groupApplication.group.pk,
          ),
        ),
      ).size > 1,
    [filteredApplications, isCommitteeMinimal],
  );

  // Custom per-committee header questions, exported with their own labels.
  // Keys are prefixed with "header_" so they can never collide with the
  // built-in columns. The union is scoped to `availableGroups`, which for a
  // committee_minimal user is exactly the committees they represent.
  const headerFieldColumns = useMemo(() => {
    if (!isCommitteeMinimal) return [];
    const seen = new Set<string>();
    const columns: { label: string; key: string }[] = [];
    for (const group of availableGroups) {
      for (const field of group.header_fields ?? []) {
        if (!isAnswerableHeaderField(field) || seen.has(field.id)) continue;
        seen.add(field.id);
        columns.push({
          label: headerFieldLabel(field),
          key: `header_${field.id}`,
        });
      }
    }
    return columns;
  }, [availableGroups, isCommitteeMinimal]);

  const csvHeaders = useMemo(
    () => [
      { label: "Fullt navn", key: "name" },
      ...(showGroupColumn ? [{ label: "Gruppe", key: "group" }] : []),
      { label: "Mobilnummer", key: "phoneNumber" },
      ...(!isCommitteeMinimal
        ? [
            { label: "Søknadstekst", key: "groupApplicationText" },
            ...(admission?.userdata.is_admin
              ? [{ label: "Prioriteringer", key: "priorityText" }]
              : []),
            { label: "E-post", key: "email" },
            { label: "Brukernavn", key: "username" },
            { label: "Søkt innen frist", key: "appliedWithinDeadline" },
            { label: "Tid sendt", key: "createdAt" },
            { label: "Tid oppdatert", key: "updatedAt" },
          ]
        : [
            { label: "Søknadstekst", key: "groupApplicationText" },
            { label: "Søkt innen frist", key: "appliedWithinDeadline" },
            { label: "Tid sendt", key: "createdAt" },
            ...headerFieldColumns,
          ]),
    ],
    [
      admission?.userdata.is_admin,
      headerFieldColumns,
      isCommitteeMinimal,
      showGroupColumn,
    ],
  );

  // Fill one column per header field, matching the union in
  // `headerFieldColumns`. Values are stringified (checkboxes become
  // Ja/Nei) so escaping stays consistent with the other columns.
  const headerResponseValues = (
    groupPk: string,
    responses: Record<string, string | boolean>,
  ): Record<string, string> => {
    const group = availableGroups.find((candidate) => candidate.pk === groupPk);
    const values: Record<string, string> = {};
    for (const field of group?.header_fields ?? []) {
      if (!isAnswerableHeaderField(field)) continue;
      const raw = responses[field.id];
      values[`header_${field.id}`] =
        typeof raw === "boolean" ? (raw ? "Ja" : "Nei") : (raw ?? "");
    }
    return values;
  };

  const csvData = useMemo(
    () =>
      filteredApplications.flatMap((application) => {
        if (isFullAdminApplication(application)) {
          return application.group_applications.map((groupApplication) => ({
            name: application.user.full_name,
            group: groupApplication.group.name,
            phoneNumber: application.phone_number,
            groupApplicationText: groupApplication.text,
            priorityText: application.priority_text ?? "",
            email: application.user.email,
            username: application.user.username,
            appliedWithinDeadline: application.applied_within_deadline
              ? "Ja"
              : "Nei",
            createdAt: formatCsvDate(application.created_at),
            updatedAt: formatCsvDate(application.updated_at),
          }));
        }
        return application.group_applications.map((groupApplication) => ({
          name: application.user.full_name,
          group: groupApplication.group.name,
          phoneNumber: application.phone_number,
          groupApplicationText: groupApplication.text,
          appliedWithinDeadline: application.applied_within_deadline
            ? "Ja"
            : "Nei",
          createdAt: formatCsvDate(application.created_at),
          ...headerResponseValues(
            groupApplication.group.pk,
            groupApplication.header_fields_response ?? {},
          ),
        }));
      }),
    [availableGroups, filteredApplications],
  );

  const exportCsvData = useMemo(
    () =>
      csvData.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            typeof value === "string" ? escapeCsvCell(value) : value,
          ]),
        ),
      ) as CompleteCsvData[],
    [csvData],
  );

  const exportFilename = useMemo(() => {
    const slug = admission?.slug ?? "opptak";
    const groupPart =
      activeGroupIds.length > 0
        ? filenamePart(
            activeGroupIds
              .map(
                (groupId) =>
                  availableGroups.find((group) => group.pk === groupId)?.name ??
                  "gruppe",
              )
              .join("-"),
          )
        : "alle-grupper";
    const date = DateTime.now().setZone(CSV_TIME_ZONE).toFormat("yyyy-LL-dd");
    return `${slug}-${groupPart}-${date}.csv`;
  }, [admission?.slug, activeGroupIds, availableGroups]);

  return {
    showGroupColumn,
    csvHeaders,
    exportCsvData,
    exportFilename,
  };
};
