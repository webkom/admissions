import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { FieldModel, InputResponseModel } from "src/utils/jsonFields";
import { apiClient } from "../utils/callApi";

// Admin mutations

export interface MutationAdmission {
  title: string;
  slug?: string;
  description: string;
  header_fields: FieldModel[];
  open_from: string;
  public_deadline: string;
  closed_from: string;
  admin_groups: number[];
  groups: number[];
}
interface CreateAdmissionProps {
  admission: MutationAdmission;
}

export interface AdmissionMutationResponse extends MutationAdmission {
  created_by: number;
}

export const useAdminCreateAdmission = () => {
  const queryClient = useQueryClient();
  return useMutation<
    AdmissionMutationResponse,
    AxiosError,
    CreateAdmissionProps
  >(
    async ({ admission }) =>
      (await apiClient.post("/admin/admission/", admission)).data,
    {
      onSuccess: () => {
        queryClient.invalidateQueries([`/admin/admission/`]);
      },
    },
  );
};

interface UpdateAdmissionProps extends CreateAdmissionProps {
  slug: string;
}

export const useAdminUpdateAdmission = () => {
  const queryClient = useQueryClient();
  return useMutation<
    AdmissionMutationResponse,
    AxiosError,
    UpdateAdmissionProps
  >(
    async ({ slug, admission }) =>
      (await apiClient.patch(`/admin/admission/${slug}/`, admission)).data,
    {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries([`/admin/admission/`]);
        queryClient.invalidateQueries([`/admin/admission/${variables.slug}/`]);
      },
    },
  );
};

interface DeleteAdmissionProps {
  slug: string;
}

export const useAdminDeleteAdmission = () => {
  const queryClient = useQueryClient();
  return useMutation<
    AdmissionMutationResponse,
    AxiosError,
    DeleteAdmissionProps
  >(
    async ({ slug }) =>
      (await apiClient.delete(`/admin/admission/${slug}/`)).data,
    {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries([`/admin/admission/`]);
        queryClient.invalidateQueries([`/admin/admission/${variables.slug}/`]);
      },
    },
  );
};

// User mutations

export const useDeleteMyApplicationMutation = (slug: string) => {
  const queryClient = useQueryClient();
  return useMutation<unknown, AxiosError>(
    () => apiClient.delete(`/admission/${slug}/application/mine/`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([`/admission/${slug}/application/mine/`]);
      },
    },
  );
};

interface DeleteGroupApplicationProps {
  applicationId: number;
  groupName?: string;
}

export const useDeleteGroupApplicationMutation = (admissionSlug: string) => {
  const queryClient = useQueryClient();
  return useMutation<unknown, AxiosError, DeleteGroupApplicationProps>(
    ({ applicationId, groupName }) =>
      apiClient.delete(
        `/admission/${admissionSlug}/application/${applicationId}/delete_group_application/${
          groupName ? `?group=${groupName}` : ""
        }`,
      ),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([
          `/admission/${admissionSlug}/application/`,
        ]);
      },
    },
  );
};

interface UpdateGroupProps {
  groupPrimaryKey: number;
  updatedGroupData: {
    description: string;
    response_label: string;
  };
}

interface UpdateGroupErrorData {
  description: string[];
  response_label: string[];
}

export const useUpdateGroupMutation = () =>
  useMutation<unknown, AxiosError<UpdateGroupErrorData>, UpdateGroupProps>(
    ({ groupPrimaryKey, updatedGroupData }) =>
      apiClient.patch(`/group/${groupPrimaryKey}/`, updatedGroupData),
  );

export interface MutationApplication {
  text: string;
  phone_number: string;
  applications: Record<string, string>;
  header_fields_response: InputResponseModel;
}

interface CreateApplicationProps {
  newApplication: MutationApplication;
}

export const useCreateApplicationMutation = (admissionSlug: string) => {
  const queryClient = useQueryClient();
  return useMutation<unknown, AxiosError, CreateApplicationProps>(
    ({ newApplication }) =>
      apiClient.post(
        `/admission/${admissionSlug}/application/`,
        newApplication,
      ),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([
          `/admission/${admissionSlug}/application/mine/`,
        ]);
      },
    },
  );
};
