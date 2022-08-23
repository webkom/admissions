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

export const useDeleteMyApplicationMutation = () =>
  customMutationWrapper(() => {
    return callApiFromQuery("/application/mine/", {
      method: "DELETE",
    });
  }, ["/application/mine/"]);

export const useDeleteGroupApplicationMutation = () =>
  customMutationWrapper(
    ({ applicationId, groupName }) => {
      return callApiFromQuery(
        `/application/${applicationId}/delete_group_application/${
          groupName ? `?group=${groupName}` : ""
        }`,
        {
          method: "DELETE",
        }
      );
    },
    ["/application/"]
  );

export const useUpdateGroupMutation = () =>
  customMutationWrapper(
    ({ groupPrimaryKey, updatedGroupData }) => {
      return callApiFromQuery(`/group/${groupPrimaryKey}/`, {
        method: "PATCH",
        body: JSON.stringify(updatedGroupData),
      });
    },
    ["/group/"]
  );

export const useCreateApplicationMutation = () =>
  customMutationWrapper(
    ({ newApplication }) => {
      return callApiFromQuery("/application/", {
        method: "POST",
        body: JSON.stringify(newApplication),
      });
    },
    ["/application/mine/"]
  );
