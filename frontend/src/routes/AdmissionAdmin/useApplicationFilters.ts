import { useCallback, useMemo, useState } from "react";

import type { AdminApplication, Group } from "src/types";
import { isFullAdminApplication } from "src/utils/applicationAccess";

const normalizeSearchValue = (value: string): string =>
  value.trim().toLocaleLowerCase("nb-NO");

const normalizePhoneSearch = (value: string): string =>
  value.replace(/[^\d+]/g, "");

export interface ApplicationFilters {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  selectedInterviewStatus: string;
  setSelectedInterviewStatus: (value: string) => void;
  selectedGroupIds: string[];
  setSelectedGroupIds: (value: string[]) => void;
  filteredApplications: AdminApplication[];
  groupApplicationCounts: Record<string, number>;
  activeGroupIds: string[];
  filtersAreActive: boolean;
  resetFilters: () => void;
}

interface UseApplicationFiltersArgs {
  sortedApplications: AdminApplication[];
  availableGroups: Group[];
  scopedGroup: Group | undefined;
}

export const useApplicationFilters = ({
  sortedApplications,
  availableGroups,
  scopedGroup,
}: UseApplicationFiltersArgs): ApplicationFilters => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedInterviewStatus, setSelectedInterviewStatus] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  const activeGroupIds = useMemo(
    () => (scopedGroup ? [scopedGroup.pk] : selectedGroupIds),
    [scopedGroup, selectedGroupIds],
  );

  const groupApplicationCounts = useMemo(
    () =>
      Object.fromEntries(
        availableGroups.map((group) => [
          group.pk,
          sortedApplications.filter((application) =>
            application.group_applications.some(
              (groupApplication) => groupApplication.group.pk === group.pk,
            ),
          ).length,
        ]),
      ),
    [availableGroups, sortedApplications],
  );

  const filteredApplications = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(searchTerm);
    const normalizedPhone = normalizePhoneSearch(searchTerm);

    return sortedApplications.reduce<AdminApplication[]>(
      (visibleApplications, application) => {
        if (
          selectedInterviewStatus &&
          application.interview_status !== selectedInterviewStatus
        ) {
          return visibleApplications;
        }

        if (
          normalizedSearch &&
          ![
            application.user.full_name,
            application.phone_number,
            ...(isFullAdminApplication(application)
              ? [application.user.username, application.user.email]
              : []),
          ].some((value) =>
            normalizeSearchValue(value).includes(normalizedSearch),
          ) &&
          (!normalizedPhone ||
            !normalizePhoneSearch(application.phone_number).includes(
              normalizedPhone,
            ))
        ) {
          return visibleApplications;
        }

        if (isFullAdminApplication(application)) {
          const groupApplications =
            activeGroupIds.length > 0
              ? application.group_applications.filter((groupApplication) =>
                  activeGroupIds.includes(groupApplication.group.pk),
                )
              : application.group_applications;
          if (groupApplications.length > 0) {
            visibleApplications.push({
              ...application,
              group_applications: groupApplications,
            });
          }
          return visibleApplications;
        }

        const groupApplications =
          activeGroupIds.length > 0
            ? application.group_applications.filter((groupApplication) =>
                activeGroupIds.includes(groupApplication.group.pk),
              )
            : application.group_applications;
        if (groupApplications.length > 0) {
          visibleApplications.push({
            ...application,
            group_applications: groupApplications,
          });
        }
        return visibleApplications;
      },
      [],
    );
  }, [activeGroupIds, searchTerm, selectedInterviewStatus, sortedApplications]);

  const filtersAreActive =
    searchTerm.trim() !== "" ||
    selectedInterviewStatus !== "" ||
    selectedGroupIds.length > 0;

  const resetFilters = useCallback(() => {
    setSearchTerm("");
    setSelectedInterviewStatus("");
    setSelectedGroupIds([]);
  }, []);

  return {
    searchTerm,
    setSearchTerm,
    selectedInterviewStatus,
    setSelectedInterviewStatus,
    selectedGroupIds,
    setSelectedGroupIds,
    filteredApplications,
    groupApplicationCounts,
    activeGroupIds,
    filtersAreActive,
    resetFilters,
  };
};
