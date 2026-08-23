import { useMemo } from "react";
import { DateTime } from "luxon";

import type { AdminApplication, Admission, Group } from "src/types";
import { isFullAdminApplication } from "src/utils/applicationAccess";
import { escapeCsvCell } from "src/utils/methods";
import type { CompleteCsvData } from "src/routes/AdmissionAdmin/components/CSVExportHandler";

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
        : []),
    ],
    [admission?.userdata.is_admin, isCommitteeMinimal, showGroupColumn],
  );

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
        }));
      }),
    [filteredApplications],
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
