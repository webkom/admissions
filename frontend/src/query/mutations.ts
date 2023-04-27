import { useMutation, useQueryClient } from "@tanstack/react-query";
import { callApiFromQuery } from "../utils/callApi";

// Admin mutations

export interface MutationAdmission {
  title: string;
  slug?: string;
  description: string;
  open_from: string;
  public_deadline: string;
  closed_from: string;
  groups: number[];
}
interface CreateAdmissionProps {
  admission: MutationAdmission;
}

export const useAdminCreateAdmission = () => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ admission }: CreateAdmissionProps) => {
      return callApiFromQuery(`/admin/admission/`, {
        method: "POST",
        body: JSON.stringify(admission),
      });
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries([`/admin/admission/`]);
      },
    }
  );
};

interface UpdateAdmissionProps extends CreateAdmissionProps {
  admissionId: string;
}

export const useAdminUpdateAdmission = () => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ admissionId, admission }: UpdateAdmissionProps) => {
      return callApiFromQuery(`/admin/admission/${admissionId}/`, {
        method: "PATCH",
        body: JSON.stringify(admission),
      });
    },
    {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries([`/admin/admission/`]);
        queryClient.invalidateQueries([
          `/admin/admission/${variables.admissionId}/`,
        ]);
      },
    }
  );
};

// User mutations

export const useDeleteMyApplicationMutation = (admissionId: string) => {
  const queryClient = useQueryClient();
  return useMutation(
    () => {
      return callApiFromQuery(`/admission/${admissionId}/application/mine/`, {
        method: "DELETE",
      });
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries([
          `/admission/${admissionId}/application/mine/`,
        ]);
      },
    }
  );
};

interface DeleteGroupApplicationProps {
  applicationId: number;
  groupName?: string;
}

export const useDeleteGroupApplicationMutation = (admissionId: string) => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ applicationId, groupName }: DeleteGroupApplicationProps) => {
      return callApiFromQuery(
        `/admission/${admissionId}/application/${applicationId}/delete_group_application/${
          groupName ? `?group=${groupName}` : ""
        }`,
        {
          method: "DELETE",
        }
      );
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries([
          `/admission/${admissionId}/application/`,
        ]);
      },
    }
  );
};

type UpdateGroupError = { [key: string]: string[] };
interface UpdateGroupProps {
  groupPrimaryKey: number;
  updatedGroupData: {
    description: string;
    response_label: string;
  };
}

export const useUpdateGroupMutation = () =>
  useMutation<any, UpdateGroupError, UpdateGroupProps>(
    ({ groupPrimaryKey, updatedGroupData }) =>
      callApiFromQuery(`/group/${groupPrimaryKey}/`, {
        method: "PATCH",
        body: JSON.stringify(updatedGroupData),
      })
  );

export interface MutationApplication {
  text: string;
  phone_number: string;
  applications: Record<string, string>;
}

interface CreateApplicationProps {
  newApplication: MutationApplication;
}

export const useCreateApplicationMutation = (admissionId: string) => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ newApplication }: CreateApplicationProps) => {
      return callApiFromQuery(`/admission/${admissionId}/application/`, {
        method: "POST",
        body: JSON.stringify(newApplication),
      });
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries([
          `/admission/${admissionId}/application/mine/`,
        ]);
      },
    }
  );
};
