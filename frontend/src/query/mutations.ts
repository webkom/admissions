import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { FieldModel, InputResponseModel } from "src/utils/jsonFields";
import { apiClient } from "../utils/callApi";

// Public mutations

export const useDeleteMyApplicationMutation = (slug: string) => {
  const queryClient = useQueryClient();
  return useMutation<unknown, AxiosError>({
    mutationFn: () => apiClient.delete(`/admission/${slug}/application/mine/`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/admission/${slug}/application/mine/`],
      });
    },
  });
};

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
  return useMutation<unknown, AxiosError, CreateApplicationProps>({
    mutationFn: ({ newApplication }) =>
      apiClient.post(
        `/admission/${admissionSlug}/application/`,
        newApplication,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/admission/${admissionSlug}/application/mine/`],
      });
    },
  });
};

// Admin mutations

interface UpdateGroupProps {
  groupPrimaryKey: string;
  updatedGroupData: {
    description: string;
    response_label: string;
  };
}

interface UpdateGroupErrorData {
  description: string[];
  response_label: string[];
}

export const useAdminUpdateGroupMutation = () =>
  useMutation<unknown, AxiosError<UpdateGroupErrorData>, UpdateGroupProps>({
    mutationFn: ({ groupPrimaryKey, updatedGroupData }) =>
      apiClient.patch(`/admin/group/${groupPrimaryKey}/`, updatedGroupData),
  });

interface DeleteGroupApplicationProps {
  applicationId: string;
  groupId?: string;
}

export const useAdminDeleteApplicationMutation = (admissionSlug: string) => {
  const queryClient = useQueryClient();
  return useMutation<unknown, AxiosError, DeleteGroupApplicationProps>({
    mutationFn: ({ applicationId, groupId }) =>
      apiClient.delete(
        `/admin/admission/${admissionSlug}/application/${applicationId}/${
          groupId ? "?groupId=" + groupId : ""
        }`,
      ),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/admin/admission/${admissionSlug}/application/`],
      });
    },
  });
};

// Manage mutations

export interface MutationAdmission {
  title: string;
  slug?: string;
  description: string;
  header_fields: FieldModel[];
  open_from: string;
  public_deadline: string;
  closed_from: string;
  admin_groups: string[];
  groups: string[];
}
interface CreateAdmissionProps {
  admission: MutationAdmission;
}

export interface AdmissionMutationResponse extends MutationAdmission {
  created_by: string;
}

export const useManageCreateAdmission = () => {
  const queryClient = useQueryClient();
  return useMutation<
    AdmissionMutationResponse,
    AxiosError,
    CreateAdmissionProps
  >({
    mutationFn: async ({ admission }) =>
      (await apiClient.post("/manage/admission/", admission)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/manage/admission/`] });
    },
  });
};

interface UpdateAdmissionProps extends CreateAdmissionProps {
  slug: string;
}

export const useManageUpdateAdmission = () => {
  const queryClient = useQueryClient();
  return useMutation<
    AdmissionMutationResponse,
    AxiosError,
    UpdateAdmissionProps
  >({
    mutationFn: async ({ slug, admission }) =>
      (await apiClient.patch(`/manage/admission/${slug}/`, admission)).data,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/manage/admission/`] });
      queryClient.invalidateQueries({
        queryKey: [`/manage/admission/${variables.slug}/`],
      });
    },
  });
};

interface DeleteAdmissionProps {
  slug: string;
}

export const useManageDeleteAdmission = () => {
  const queryClient = useQueryClient();
  return useMutation<
    AdmissionMutationResponse,
    AxiosError,
    DeleteAdmissionProps
  >({
    mutationFn: async ({ slug }) =>
      (await apiClient.delete(`/manage/admission/${slug}/`)).data,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/manage/admission/`] });
      queryClient.invalidateQueries({
        queryKey: [`/manage/admission/${variables.slug}/`],
      });
    },
  });
};
