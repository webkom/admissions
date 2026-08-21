import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import type { Admission, Group } from "src/types";

/**
 * Result of {@link useApplicationScope}.
 *
 * `availableGroups` are the groups the caller can filter by — admins see all
 * participating groups; committee-minimal and recruiter views see only
 * `represented_groups`.
 *
 * `scopedGroup` is resolved from the `?group=` URL parameter. When present it
 * overrides the local filter checkboxes.
 */
interface ApplicationScope {
  availableGroups: Group[];
  scopedGroup: Group | undefined;
}

export const useApplicationScope = (
  admission: Admission | undefined,
  isCommitteeMinimal: boolean,
): ApplicationScope => {
  const [searchParams] = useSearchParams();

  const availableGroups = useMemo(
    () =>
      (admission?.groups ?? [])
        .filter(
          (group) =>
            (!isCommitteeMinimal && admission?.userdata.is_admin) ||
            admission?.userdata.represented_groups.includes(group.name),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "nb")),
    [
      admission?.groups,
      admission?.userdata.is_admin,
      admission?.userdata.represented_groups,
      isCommitteeMinimal,
    ],
  );

  const scopedGroup = useMemo(() => {
    const groupId = searchParams.get("group");
    return groupId
      ? availableGroups.find(
          (group) => group.pk === groupId || group.name === groupId,
        )
      : undefined;
  }, [availableGroups, searchParams]);

  return { availableGroups, scopedGroup };
};
