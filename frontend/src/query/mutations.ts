import { useMutation, useQueryClient } from "react-query";
import { callApiFromQuery } from "../utils/callApi";

const customMutationWrapper = (useCustomMutation, invalidateQuery) => {
  const queryClient = useQueryClient();
  return useMutation(useCustomMutation, {
    onSuccess: () => {
      if (!invalidateQuery) return;
      queryClient.invalidateQueries(invalidateQuery);
    },
  });
};

export const useDeleteMyApplicationMutation = (admissionId) =>
  customMutationWrapper(() => {
    return callApiFromQuery(`/admission/${admissionId}/application/mine/`, {
      method: "DELETE",
    });
  }, [`/admission/${admissionId}/application/mine/`]);

export const useDeleteGroupApplicationMutation = (admissionId) =>
  customMutationWrapper(
    ({ applicationId, groupName }) => {
      return callApiFromQuery(
        `/admission/${admissionId}/application/${applicationId}/delete_group_application/${
          groupName ? `?group=${groupName}` : ""
        }`,
        {
          method: "DELETE",
        }
      );
    },
    [`/admission/${admissionId}/application/`]
  );

export const useUpdateGroupMutation = () =>
  customMutationWrapper(({ groupPrimaryKey, updatedGroupData }) => {
    return callApiFromQuery(`/group/${groupPrimaryKey}/`, {
      method: "PATCH",
      body: JSON.stringify(updatedGroupData),
    });
  });

export const useCreateApplicationMutation = (admissionId) =>
  customMutationWrapper(
    ({ newApplication }) => {
      return callApiFromQuery(`/admission/${admissionId}/application/`, {
        method: "POST",
        body: JSON.stringify(newApplication),
      });
    },
    [`/admission/${admissionId}/application/mine/`]
  );
