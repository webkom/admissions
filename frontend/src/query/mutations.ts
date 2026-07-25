import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { FieldModel, InputResponseModel } from "src/utils/jsonFields";
import { AdminApplication, InterviewStatus, SavedSchedule } from "src/types";
import { apiClient } from "../utils/callApi";
import {
  areSensitiveAdmissionCacheWritesBlocked,
  captureSensitiveAdmissionAuthorityEpoch,
  isSensitiveAdmissionAuthorityEpochCurrent,
  isSensitiveAuthorityChangedError,
  resetAdminApplicationQueriesAfterNotFound,
  runSensitiveAdmissionMutation,
  SensitiveAuthorityChangedError,
  sensitiveAdmissionMutationOptions,
  type SensitiveAdmissionMutationError,
} from "./sensitiveAccess";

// Public mutations

export const useDeleteMyApplicationMutation = (slug: string) => {
  const queryClient = useQueryClient();
  const applicationQueryKey = [`/admission/${slug}/application/mine/`];
  return useMutation<unknown, SensitiveAdmissionMutationError>({
    ...sensitiveAdmissionMutationOptions(slug),
    mutationFn: () =>
      runSensitiveAdmissionMutation(slug, () =>
        apiClient.delete(`/admission/${slug}/application/mine/`),
      ),
    onSuccess: () => {
      if (areSensitiveAdmissionCacheWritesBlocked(slug)) return;
      queryClient.invalidateQueries({
        queryKey: applicationQueryKey,
      });
    },
    onError: async (error) => {
      if (isSensitiveAuthorityChangedError(error)) return;
      const status = error.response?.status ?? 0;
      if (status !== 404) return;
      await queryClient.resetQueries({
        queryKey: applicationQueryKey,
        exact: true,
      });
    },
  });
};

export interface MutationApplication {
  phone_number: string;
  priority_text?: string;
  applications: Record<string, string>;
  group_answers: Record<string, InputResponseModel>;
}

interface CreateApplicationProps {
  newApplication: MutationApplication;
}

export const useCreateApplicationMutation = (admissionSlug: string) => {
  const queryClient = useQueryClient();
  const applicationQueryKey = [`/admission/${admissionSlug}/application/mine/`];
  return useMutation<
    unknown,
    SensitiveAdmissionMutationError,
    CreateApplicationProps
  >({
    ...sensitiveAdmissionMutationOptions(admissionSlug),
    mutationFn: ({ newApplication }) =>
      runSensitiveAdmissionMutation(admissionSlug, () =>
        apiClient.post(
          `/admission/${admissionSlug}/application/`,
          newApplication,
        ),
      ),
    onSuccess: () => {
      if (areSensitiveAdmissionCacheWritesBlocked(admissionSlug)) return;
      queryClient.invalidateQueries({
        queryKey: applicationQueryKey,
      });
    },
    onError: async (error) => {
      if (isSensitiveAuthorityChangedError(error)) return;
      const status = error.response?.status ?? 0;
      if (status !== 404) return;
      await queryClient.resetQueries({
        queryKey: applicationQueryKey,
        exact: true,
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

interface TerminateCommitteeProps {
  groupId: string;
  confirmationName: string;
}

export const useTerminateCommitteeMutation = (admissionSlug: string) => {
  const queryClient = useQueryClient();

  return useMutation<
    unknown,
    SensitiveAdmissionMutationError,
    TerminateCommitteeProps
  >({
    ...sensitiveAdmissionMutationOptions(admissionSlug),
    mutationFn: ({ groupId, confirmationName }) =>
      runSensitiveAdmissionMutation(admissionSlug, () =>
        apiClient.post(
          `/admin/admission/${admissionSlug}/group/${groupId}/terminate/`,
          { confirmation_name: confirmationName },
        ),
      ),
    onSuccess: () => {
      if (areSensitiveAdmissionCacheWritesBlocked(admissionSlug)) return;
      [
        `/admin/admission/${admissionSlug}/application/`,
        `/admin/admission/${admissionSlug}/candidates/`,
        `/admin/admission/${admissionSlug}/schedule/`,
        `/admin/admission/${admissionSlug}/availability/`,
      ].forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey: [queryKey] });
      });
    },
  });
};

interface UpdateInterviewStatusProps {
  applicationId: string;
  interviewStatus: InterviewStatus;
  expectedInterviewStatusUpdatedAt: string;
}

interface InterviewStatusUpdateResponse {
  interview_status: InterviewStatus;
  interview_status_updated_at: string;
  interview_status_updated_by?: string;
}

interface InterviewStatusMutationContext {
  previousStatus?: {
    interview_status: InterviewStatus;
    interview_status_updated_at: string;
    interview_status_updated_by?: string;
  };
  previousSchedule?: SavedSchedule;
}

export const useAdminUpdateInterviewStatusMutation = (
  admissionSlug: string,
  applicationScopeKey: string,
) => {
  const queryClient = useQueryClient();
  const applicationsQueryKey = [
    `/admin/admission/${admissionSlug}/application/`,
    applicationScopeKey,
  ];
  const scheduleQueryKey = [`/admin/admission/${admissionSlug}/schedule/`];

  return useMutation<
    InterviewStatusUpdateResponse,
    SensitiveAdmissionMutationError,
    UpdateInterviewStatusProps,
    InterviewStatusMutationContext
  >({
    ...sensitiveAdmissionMutationOptions(admissionSlug),
    mutationFn: ({
      applicationId,
      interviewStatus,
      expectedInterviewStatusUpdatedAt,
    }) =>
      runSensitiveAdmissionMutation(
        admissionSlug,
        async () =>
          (
            await apiClient.patch<InterviewStatusUpdateResponse>(
              `/admin/admission/${admissionSlug}/application/${applicationId}/interview-status/`,
              {
                interview_status: interviewStatus,
                expected_interview_status_updated_at:
                  expectedInterviewStatusUpdatedAt,
              },
            )
          ).data,
      ),
    onMutate: async ({ applicationId, interviewStatus }) => {
      if (areSensitiveAdmissionCacheWritesBlocked(admissionSlug)) return {};
      const authorityEpoch =
        captureSensitiveAdmissionAuthorityEpoch(admissionSlug);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: applicationsQueryKey }),
        queryClient.cancelQueries({ queryKey: scheduleQueryKey }),
      ]);
      if (
        !isSensitiveAdmissionAuthorityEpochCurrent(
          admissionSlug,
          authorityEpoch,
        )
      ) {
        throw new SensitiveAuthorityChangedError(admissionSlug);
      }
      const previousApplication = queryClient
        .getQueryData<AdminApplication[]>(applicationsQueryKey)
        ?.find((application) => application.pk === applicationId);
      const previousSchedule =
        queryClient.getQueryData<SavedSchedule>(scheduleQueryKey);

      queryClient.setQueryData<AdminApplication[]>(
        applicationsQueryKey,
        (currentApplications) =>
          currentApplications?.map((application) =>
            application.pk === applicationId
              ? { ...application, interview_status: interviewStatus }
              : application,
          ),
      );
      queryClient.setQueryData<SavedSchedule>(scheduleQueryKey, (current) =>
        current
          ? {
              ...current,
              schedule: current.schedule.map((item) =>
                item.candidate_id === applicationId
                  ? { ...item, interview_status: interviewStatus }
                  : item,
              ),
            }
          : current,
      );

      return {
        previousStatus: previousApplication
          ? {
              interview_status: previousApplication.interview_status,
              interview_status_updated_at:
                previousApplication.interview_status_updated_at,
              interview_status_updated_by:
                "interview_status_updated_by" in previousApplication
                  ? previousApplication.interview_status_updated_by
                  : undefined,
            }
          : undefined,
        previousSchedule,
      };
    },
    onError: async (error, { applicationId }, context) => {
      if (isSensitiveAuthorityChangedError(error)) return;
      const status = error.response?.status ?? 0;
      if (
        [401, 403].includes(status) ||
        areSensitiveAdmissionCacheWritesBlocked(admissionSlug)
      ) {
        return;
      }
      if (status === 404) {
        await Promise.all([
          queryClient.resetQueries({
            queryKey: applicationsQueryKey,
            exact: true,
          }),
          queryClient.resetQueries({ queryKey: scheduleQueryKey, exact: true }),
        ]);
        return;
      }
      const previousStatus = context?.previousStatus;
      if (previousStatus) {
        queryClient.setQueryData<AdminApplication[]>(
          applicationsQueryKey,
          (currentApplications) =>
            currentApplications?.map((application) =>
              application.pk === applicationId
                ? { ...application, ...previousStatus }
                : application,
            ),
        );
      }
      if (context?.previousSchedule) {
        queryClient.setQueryData(scheduleQueryKey, context.previousSchedule);
      }
    },
    onSuccess: (updatedStatus, { applicationId }) => {
      if (areSensitiveAdmissionCacheWritesBlocked(admissionSlug)) return;
      queryClient.setQueryData<AdminApplication[]>(
        applicationsQueryKey,
        (currentApplications) =>
          currentApplications?.map((application) =>
            application.pk === applicationId
              ? {
                  ...application,
                  interview_status: updatedStatus.interview_status,
                  interview_status_updated_at:
                    updatedStatus.interview_status_updated_at,
                  ...("interview_status_updated_by" in application &&
                  updatedStatus.interview_status_updated_by !== undefined
                    ? {
                        interview_status_updated_by:
                          updatedStatus.interview_status_updated_by,
                      }
                    : {}),
                }
              : application,
          ),
      );
      queryClient.setQueryData<SavedSchedule>(scheduleQueryKey, (current) =>
        current
          ? {
              ...current,
              schedule: current.schedule.map((item) =>
                item.candidate_id === applicationId
                  ? {
                      ...item,
                      interview_status: updatedStatus.interview_status,
                      interview_status_updated_at:
                        updatedStatus.interview_status_updated_at,
                      interview_status_updated_by:
                        updatedStatus.interview_status_updated_by,
                    }
                  : item,
              ),
            }
          : current,
      );
    },
    onSettled: (_data, error) => {
      if (
        isSensitiveAuthorityChangedError(error) ||
        areSensitiveAdmissionCacheWritesBlocked(admissionSlug) ||
        [401, 403, 404].includes(error?.response?.status ?? 0)
      ) {
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: [`/admin/admission/${admissionSlug}/application/`],
      });
      void queryClient.invalidateQueries({ queryKey: scheduleQueryKey });
    },
  });
};

export const useAdminDeleteApplicationMutation = (admissionSlug: string) => {
  const queryClient = useQueryClient();
  const applicationsQueryKey = [
    `/admin/admission/${admissionSlug}/application/`,
  ];
  return useMutation<
    unknown,
    SensitiveAdmissionMutationError,
    DeleteGroupApplicationProps
  >({
    ...sensitiveAdmissionMutationOptions(admissionSlug),
    mutationFn: ({ applicationId, groupId }) =>
      runSensitiveAdmissionMutation(admissionSlug, () =>
        apiClient.delete(
          `/admin/admission/${admissionSlug}/application/${applicationId}/${
            groupId ? "?groupId=" + groupId : ""
          }`,
        ),
      ),

    onSuccess: () => {
      if (areSensitiveAdmissionCacheWritesBlocked(admissionSlug)) return;
      queryClient.invalidateQueries({
        queryKey: applicationsQueryKey,
      });
    },
    onError: async (error) => {
      if (isSensitiveAuthorityChangedError(error)) return;
      const status = error.response?.status ?? 0;
      if (status !== 404) return;
      await resetAdminApplicationQueriesAfterNotFound(
        queryClient,
        admissionSlug,
      );
    },
  });
};

// Manage mutations

export interface CommitteeContent {
  committee_info: string | null;
  application_guidance: string | null;
  interview_description: string | null;
}

export interface MutationAdmission {
  title: string;
  slug?: string;
  description: string;
  group_questions: Record<string, FieldModel[]>;
  group_content: Record<string, CommitteeContent>;
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
