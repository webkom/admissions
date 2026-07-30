import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useAdmission } from "src/query/hooks";
import {
  buildSensitiveAdmissionScopeKey,
  clearAllSensitiveDataForActorChange,
  clearSensitiveAdmissionDataForScopeChange,
  restoreSensitiveAccessAfterVerifiedAdmission,
} from "src/query/sensitiveAccess";
import { publishSensitiveActorIdentity } from "src/query/sensitiveActorSync";
import { iconSizes } from "src/styles/designTokens";
import type { Admission } from "src/types";
import { apiClient } from "src/utils/callApi";
import cn from "src/utils/cn";
import djangoData from "src/utils/djangoData";
import {
  getAdmissionAccessProjection,
  getLandingAccessLinks,
  resolveScheduleWorkspaceContext,
  resolveScheduleWorkspaceScopeId,
} from "src/utils/admissionAccess";
import { keyboardFocusRingClass } from "src/components/Scheduling/ui";
import config from "src/utils/config";

export interface ScheduleWorkspaceProps {
  admissionTitle: string;
  committeeName: string;
  committeeScopeId: string;
  admissionSlug: string;
  isAdmin: boolean;
  canManageSchedule: boolean;
  committeeRole: "leader" | "recruiting" | "member" | null;
  canManageInterviewWorkflow: boolean;
  currentActorId?: string;
}

interface SchedulePageAccessBoundaryProps {
  children: (
    props: ScheduleWorkspaceProps,
    workspaceKey: string,
  ) => React.ReactNode;
}

const SchedulePageAccessBoundary: React.FC<SchedulePageAccessBoundaryProps> = ({
  children,
}) => {
  const { admissionSlug } = useParams();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [activeSensitiveScopeKey, setActiveSensitiveScopeKey] = useState("");
  const [isAccessRecoveryLoading, setIsAccessRecoveryLoading] = useState(false);
  const [accessRecoveryError, setAccessRecoveryError] = useState("");
  const {
    data: admission,
    isError: isAdmissionError,
    error: admissionError,
    refetch: refetchAdmission,
  } = useAdmission(admissionSlug ?? "");

  const embeddedActorId = djangoData.user.id ?? null;
  const hasServerActorIdentity = Boolean(
    admission &&
      Object.prototype.hasOwnProperty.call(admission.userdata, "actor_id"),
  );
  const serverActorId = hasServerActorIdentity
    ? (admission?.userdata.actor_id ?? null)
    : embeddedActorId;
  const scheduleContext = admission
    ? resolveScheduleWorkspaceContext({
        userdata: admission.userdata,
        mode: searchParams.get("mode"),
        groupId: searchParams.get("group"),
      })
    : null;
  const accessProjection = admission
    ? getAdmissionAccessProjection(admission.userdata)
    : null;
  const actorIdentityMismatch = Boolean(
    admission && hasServerActorIdentity && serverActorId !== embeddedActorId,
  );
  const sensitiveScopeKey = admission
    ? buildSensitiveAdmissionScopeKey({
        actorId: serverActorId,
        isAdmin: admission.userdata.is_admin,
        committeeRole: admission.userdata.committee_role,
        representedGroups: admission.userdata.represented_groups,
        committeeGroups: admission.userdata.committee_groups,
        groupContexts: accessProjection?.groupContexts ?? [],
        admissionActions: accessProjection?.admissionActions,
        resourceScopes: accessProjection?.resourceScopes,
        scheduleContext,
      })
    : "";
  const sensitiveScopeChangePending = Boolean(
    admission && activeSensitiveScopeKey !== sensitiveScopeKey,
  );

  React.useLayoutEffect(() => {
    if (!admission || !sensitiveScopeKey) return;
    if (actorIdentityMismatch) {
      clearAllSensitiveDataForActorChange(queryClient);
      publishSensitiveActorIdentity(serverActorId);
      window.location.reload();
      return;
    }
    publishSensitiveActorIdentity(serverActorId);
    if (activeSensitiveScopeKey === sensitiveScopeKey) return;
    clearSensitiveAdmissionDataForScopeChange(
      queryClient,
      admissionSlug ?? "",
      {
        clearBrowserStorage: activeSensitiveScopeKey !== "",
      },
    );
    setActiveSensitiveScopeKey(sensitiveScopeKey);
  }, [
    activeSensitiveScopeKey,
    admission,
    admissionSlug,
    actorIdentityMismatch,
    queryClient,
    serverActorId,
    sensitiveScopeKey,
  ]);

  if (config.SCHEDULER_ENABLED === false) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 handheld:px-4">
        <p role="status" className="m-0 text-ui font-semibold text-text-muted">
          Intervjuplanlegging er ikke tilgjengelig.
        </p>
      </div>
    );
  }

  const recoverSensitiveAccess = async () => {
    if (!admissionSlug || isAccessRecoveryLoading) return;
    setIsAccessRecoveryLoading(true);
    setAccessRecoveryError("");
    try {
      const freshAdmission = (
        await apiClient.get<Admission>(`/admission/${admissionSlug}/`)
      ).data;
      const restored = restoreSensitiveAccessAfterVerifiedAdmission(
        queryClient,
        admissionSlug,
        freshAdmission,
      );
      if (!restored) {
        setAccessRecoveryError(
          "Serveren bekreftet ikke en aktiv rolle i intervjuplanleggingen.",
        );
        return;
      }

      queryClient.setQueryData(
        [`/admission/${admissionSlug}/`],
        freshAdmission,
      );
    } catch {
      setAccessRecoveryError(
        "Tilgangen er fortsatt utilgjengelig. Logg inn på nytt hvis økten er utløpt.",
      );
    } finally {
      setIsAccessRecoveryLoading(false);
    }
  };

  if (isAdmissionError) {
    const accessDenied = [401, 403].includes(
      admissionError?.response?.status ?? 0,
    );
    return (
      <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 handheld:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-border bg-danger-bg px-4 py-3">
          <p className="m-0 text-ui font-semibold text-danger">
            {accessDenied
              ? "Tilgangen til intervjuplanleggingen er fjernet. Kandidatdata er tømt fra visningen."
              : "Kunne ikke hente opptaket."}
          </p>
          {accessDenied ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void recoverSensitiveAccess()}
                disabled={isAccessRecoveryLoading}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border border-danger-border bg-surface-base px-3 py-2 text-detail font-bold text-danger disabled:cursor-not-allowed disabled:opacity-60",
                  keyboardFocusRingClass,
                )}
              >
                {isAccessRecoveryLoading && (
                  <Loader2
                    size={iconSizes.detail}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                )}
                Kontroller tilgang
              </button>
              <a
                href="/login/lego/"
                className={cn(
                  "rounded-lg px-3 py-2 text-detail font-bold text-danger underline decoration-danger/50 underline-offset-4",
                  keyboardFocusRingClass,
                )}
              >
                Logg inn på nytt
              </a>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => refetchAdmission()}
              className={cn(
                "rounded-lg border border-danger-border bg-surface-base px-3 py-2 text-detail font-bold text-danger",
                keyboardFocusRingClass,
              )}
            >
              Prøv igjen
            </button>
          )}
        </div>
        {accessRecoveryError && (
          <p
            role="alert"
            className="m-0 mt-3 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-detail font-semibold text-danger"
          >
            {accessRecoveryError}
          </p>
        )}
      </div>
    );
  }

  if (!admission || sensitiveScopeChangePending) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 handheld:px-4">
        <div
          role="status"
          className="flex items-center justify-center gap-3 rounded-panel border border-border bg-surface-base px-6 py-16 shadow-sm"
        >
          <Loader2
            size={iconSizes.standard}
            className="animate-spin text-brand"
          />
          <span className="text-ui font-semibold text-text-muted">
            {admission ? "Oppdaterer tilgang…" : "Laster…"}
          </span>
        </div>
      </div>
    );
  }

  if (!scheduleContext?.valid) {
    if (scheduleContext?.requiresCommitteeSelection && admission) {
      const memberLinks = getLandingAccessLinks(
        admission.slug,
        admission.userdata,
      ).scheduleMember;
      return (
        <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 handheld:px-4">
          <section
            aria-labelledby="schedule-committee-chooser-title"
            className="rounded-xl border border-border bg-surface-base px-5 py-4 shadow-sm"
          >
            <h1
              id="schedule-committee-chooser-title"
              className="m-0 text-lg font-bold text-text-primary"
            >
              Velg komité
            </h1>
            <p className="mb-0 mt-2 text-ui text-text-muted">
              Velg hvilken komité du vil registrere tilgjengelighet for.
            </p>
            <ul className="mb-0 mt-4 list-none space-y-2 p-0">
              {memberLinks.map((link) => (
                <li key={link.key}>
                  <a
                    href={link.to}
                    className={cn(
                      "inline-flex rounded-lg border border-border px-3 py-2 text-ui font-semibold text-brand hover:bg-brand-soft",
                      keyboardFocusRingClass,
                    )}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      );
    }
    return (
      <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 handheld:px-4">
        <div
          role="alert"
          className="rounded-xl border border-danger-border bg-danger-bg px-5 py-4 text-ui font-semibold text-danger"
        >
          {scheduleContext?.invalid
            ? "Arbeidskonteksten er ikke gyldig for denne brukeren. Velg en arbeidsflate fra opptakets startside."
            : "Du har ikke tilgang til intervjuplanleggingen for dette opptaket."}
        </div>
      </div>
    );
  }

  const { committee_role, represented_groups, committee_groups } =
    admission.userdata;
  const committeeName =
    scheduleContext.groupContext?.group.name ??
    represented_groups[0] ??
    committee_groups[0] ??
    (admission.groups.length === 1
      ? admission.groups[0].name
      : admission.title);
  const committeeScopeId = resolveScheduleWorkspaceScopeId(
    scheduleContext,
    admission.userdata,
  );
  const canManageSchedule = scheduleContext.mode === "admin";
  const committeeRole =
    scheduleContext.groupContext?.membership_role ?? committee_role;

  return children(
    {
      admissionTitle: admission.title,
      committeeName,
      committeeScopeId,
      admissionSlug: admissionSlug ?? "",
      isAdmin: canManageSchedule,
      canManageSchedule,
      committeeRole,
      canManageInterviewWorkflow: canManageSchedule,
      currentActorId: serverActorId ?? undefined,
    },
    `${admissionSlug}:${sensitiveScopeKey}`,
  );
};

export default SchedulePageAccessBoundary;
