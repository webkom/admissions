import { useState } from "react";
import type { StatusToastState } from "src/components/StatusToast";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import {
  CONFLICT_MESSAGE,
  isConflictError,
  scheduleSaveErrorMessage,
} from "src/components/Scheduling/Solver/solverHelpers";
import { useSaveSchedule } from "src/query/hooks";
import type { NameVisibility, SavedSchedule, ScheduleItem } from "src/types";
import type { InterviewOutreachTemplates } from "./interviewOutreach";
import { apiClient } from "src/utils/callApi";
import {
  admissionGroupScope,
  areSensitiveAdmissionCacheWritesBlocked,
  captureSensitiveAdmissionAuthorityEpoch,
  isSensitiveAdmissionAuthorityEpochCurrent,
  isSensitiveAuthorityChangedError,
  purgeSensitiveAuthorizationFailure,
} from "src/query/sensitiveAccess";

type Notify = (message: string, tone?: StatusToastState["tone"]) => void;

// Server 400 payloads for the save-schedule endpoint use field names as keys
// and human-readable strings as values. The publish gate cares specifically
// about `schedule` because that is where the kandidatkontroll refusal (and a
// handful of other publish-time checks) surface; the rest of the payload is
// collapsed into the generic planTransitionError.
const extractScheduleFieldError = (error: unknown): string | null => {
  if (!isAxiosError(error)) return null;
  const data = error.response?.data;
  if (!data || typeof data !== "object") return null;
  const value = (data as Record<string, unknown>).schedule;
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0];
  return typeof first === "string" ? first : null;
};

interface DistributedPlanActionsParams {
  admissionSlug: string;
  groupId: string;
  savedSchedule: SavedSchedule | undefined;
  draftPersistenceReady?: boolean;
  /** Dev-only mock data: the plan shown contains fictitious interviewers that
   * do not exist in the backend, so no edit can ever be persisted. */
  syntheticInput?: boolean;
  notify: Notify;
}

export const useDistributedPlanActions = ({
  admissionSlug,
  groupId,
  savedSchedule,
  draftPersistenceReady = true,
  syntheticInput = false,
  notify,
}: DistributedPlanActionsParams) => {
  const queryClient = useQueryClient();
  const scope = admissionGroupScope(admissionSlug, groupId);
  const saveSchedule = useSaveSchedule(admissionSlug, groupId);
  const scheduleQueryKey = [
    `/admin/admission/${admissionSlug}/group/${groupId}/schedule/`,
  ];
  const [planTransition, setPlanTransition] = useState<
    "publishing" | "unlocking" | null
  >(null);
  const [planTransitionError, setPlanTransitionError] = useState("");
  // Structured `schedule` field from the server's 400, kept separate from
  // planTransitionError so the gate can render it as the actual reason
  // (e.g. "3 intervjuere må kontrollere ...") instead of a generic toast.
  const [scheduleFieldError, setScheduleFieldError] = useState("");
  const reportAccessFailure = (purged: boolean) => {
    if (purged) {
      notify(
        "Tilgangen til intervjuplanleggingen er ikke lenger tilgjengelig.",
        "error",
      );
    }
    return purged;
  };
  const handleAuthorizationFailure = (error: unknown) =>
    reportAccessFailure(purgeSensitiveAuthorizationFailure(queryClient, error));
  const isAmbiguousPublicationFailure = (error: unknown) => {
    if (!isAxiosError(error)) return true;
    const status = error.response?.status;
    return status === undefined || status === 409 || status >= 500;
  };
  const reconcilePublishedSchedule = async (visibility: NameVisibility) => {
    const authorityEpoch = captureSensitiveAdmissionAuthorityEpoch(scope);
    try {
      const { data } = await apiClient.get<SavedSchedule>(
        `/admin/admission/${admissionSlug}/group/${groupId}/schedule/`,
      );
      if (
        areSensitiveAdmissionCacheWritesBlocked(scope) ||
        !isSensitiveAdmissionAuthorityEpochCurrent(scope, authorityEpoch)
      ) {
        return "access-lost" as const;
      }
      queryClient.setQueryData(scheduleQueryKey, data);
      const publishedSameDraft =
        data.is_distributed &&
        data.name_visibility === visibility &&
        JSON.stringify(data.schedule) ===
          JSON.stringify(savedSchedule?.schedule ?? []);
      return publishedSameDraft
        ? ("published" as const)
        : ("different-state" as const);
    } catch (error) {
      if (!isSensitiveAdmissionAuthorityEpochCurrent(scope, authorityEpoch)) {
        return "access-lost" as const;
      }
      return handleAuthorizationFailure(error)
        ? ("access-lost" as const)
        : ("unknown" as const);
    }
  };

  const saveScheduleRows = async (
    schedule: ScheduleItem[],
    successMessage: string,
    errorMessage: string,
  ) => {
    if (!savedSchedule) return false;
    if (syntheticInput) {
      notify(
        "Simulerte planer kan ikke lagres — de inneholder fiktive intervjuere " +
          "som ikke finnes i systemet. Skru av «Simuler testdata» og generer " +
          "på nytt med ekte data for å kunne lagre.",
        "error",
      );
      return false;
    }
    try {
      // The exact current boundary, not the is_distributed echo: a row edit
      // means "keep the publish state as it is", never "publish everything".
      await saveSchedule.mutateAsync({
        schedule,
        ...(savedSchedule.distributed_through
          ? { distributed_through: savedSchedule.distributed_through }
          : { is_distributed: false }),
        expected_updated_at: savedSchedule.updated_at,
      });
      if (areSensitiveAdmissionCacheWritesBlocked(scope)) return false;
      notify(successMessage);
      return true;
    } catch (error) {
      if (isSensitiveAuthorityChangedError(error)) return false;
      if (handleAuthorizationFailure(error)) return false;
      notify(
        isConflictError(error)
          ? CONFLICT_MESSAGE
          : scheduleSaveErrorMessage(error, errorMessage),
        "error",
      );
      return false;
    }
  };

  /** Throw away the unpublished part of the plan and start over.
   *
   *  `keptRows` is what survives - the published prefix, or nothing at all
   *  when the plan was never published. The caller does the split (it owns
   *  the framework dates needed to decode row times); this only persists it.
   *  Reusing saveScheduleRows keeps the publication boundary exactly where
   *  it was: deleting a draft must never publish or unpublish anything.
   *
   *  The draft autosave deliberately refuses to write an empty schedule, so
   *  this explicit mutation is the only way to clear a plan. */
  const clearUnpublishedDraft = async (
    keptRows: ScheduleItem[],
    removedCount: number,
  ) =>
    saveScheduleRows(
      keptRows,
      removedCount === 1
        ? "Intervjuet er fjernet fra planutkastet."
        : `${removedCount} intervjuer er fjernet fra planutkastet.`,
      "Kunne ikke slette planutkastet. Prøv igjen.",
    );

  const setNameVisibility = async (visibility: NameVisibility) => {
    if (!savedSchedule) return false;
    try {
      await saveSchedule.mutateAsync({
        name_visibility: visibility,
        expected_updated_at: savedSchedule.updated_at,
      });
      if (areSensitiveAdmissionCacheWritesBlocked(scope)) return false;
      notify("Synlighet oppdatert.");
      return true;
    } catch (error) {
      if (isSensitiveAuthorityChangedError(error)) return false;
      if (handleAuthorizationFailure(error)) return false;
      notify(
        isConflictError(error)
          ? CONFLICT_MESSAGE
          : "Kunne ikke oppdatere synlighet.",
        "error",
      );
      return false;
    }
  };

  const publishSchedule = async (
    visibility: NameVisibility,
    deviationApprovalFingerprint?: string,
    distributedThrough?: string,
    deferUnplacedCandidates?: boolean,
    publishWithoutFullReview?: boolean,
  ) => {
    if (!savedSchedule || savedSchedule.schedule.length === 0) return false;
    if (!draftPersistenceReady) {
      notify(
        "Vent til de siste endringene i planutkastet er lagret før publisering.",
        "error",
      );
      return false;
    }
    setPlanTransition("publishing");
    setPlanTransitionError("");
    setScheduleFieldError("");
    try {
      await saveSchedule.mutateAsync({
        ...(distributedThrough
          ? { distributed_through: distributedThrough }
          : { is_distributed: true }),
        name_visibility: visibility,
        ...(deviationApprovalFingerprint
          ? {
              deviation_approval_fingerprint: deviationApprovalFingerprint,
            }
          : {}),
        ...(deferUnplacedCandidates ? { defer_unplaced_candidates: true } : {}),
        ...(publishWithoutFullReview
          ? { publish_without_full_review: true }
          : {}),
        expected_updated_at: savedSchedule.updated_at,
      });
      if (areSensitiveAdmissionCacheWritesBlocked(scope)) return false;
      setScheduleFieldError("");
      notify(
        distributedThrough
          ? "Intervjuplanen er delvis publisert for komiteen."
          : "Intervjuplanen er publisert for komiteen.",
      );
      return true;
    } catch (error) {
      if (isSensitiveAuthorityChangedError(error)) return false;
      if (handleAuthorizationFailure(error)) return false;
      if (isAmbiguousPublicationFailure(error)) {
        const reconciliation = await reconcilePublishedSchedule(visibility);
        if (reconciliation === "published") {
          setPlanTransitionError("");
          setScheduleFieldError("");
          notify("Intervjuplanen er publisert for komiteen.");
          return true;
        }
        if (reconciliation === "access-lost") return false;
        if (reconciliation === "unknown") {
          const message =
            "Publiseringsstatusen kunne ikke kontrolleres. Oppdater siden før du prøver igjen.";
          setPlanTransitionError(message);
          notify(message, "error");
          return false;
        }
      }
      const message = isConflictError(error)
        ? CONFLICT_MESSAGE
        : scheduleSaveErrorMessage(
            error,
            "Kunne ikke publisere intervjuplanen. Prøv igjen.",
          );
      setPlanTransitionError(message);
      const structured = extractScheduleFieldError(error);
      if (structured) setScheduleFieldError(structured);
      notify(message, "error");
      return false;
    } finally {
      setPlanTransition(null);
    }
  };

  const extendDistributedThrough = async (date: string) => {
    if (!savedSchedule) return false;
    setPlanTransition("publishing");
    setPlanTransitionError("");
    try {
      // Extending the publish boundary is the explicit "delplan" action
      // we agreed on: the user is moving the published prefix forward
      // while unplaced candidates may still live in the still-draft
      // tail. Without the deferral flag the strict "everyone placed"
      // gate would fire for any extension that doesn't fully saturate
      // the new boundary. The user can still see how many are
      // outstanding on the published plan view.
      await saveSchedule.mutateAsync({
        distributed_through: date,
        defer_unplaced_candidates: true,
        expected_updated_at: savedSchedule.updated_at,
      });
      if (areSensitiveAdmissionCacheWritesBlocked(scope)) return false;
      notify("Publiseringsgrensen er utvidet.");
      return true;
    } catch (error) {
      if (isSensitiveAuthorityChangedError(error)) return false;
      if (handleAuthorizationFailure(error)) return false;
      const message = isConflictError(error)
        ? CONFLICT_MESSAGE
        : scheduleSaveErrorMessage(
            error,
            "Kunne ikke utvide publiseringsgrensen. Prøv igjen.",
          );
      setPlanTransitionError(message);
      notify(message, "error");
      return false;
    } finally {
      setPlanTransition(null);
    }
  };

  const unlockSchedule = async () => {
    if (!savedSchedule) return false;
    setPlanTransition("unlocking");
    setPlanTransitionError("");
    try {
      await saveSchedule.mutateAsync({
        is_distributed: false,
        expected_updated_at: savedSchedule.updated_at,
      });
      if (areSensitiveAdmissionCacheWritesBlocked(scope)) return false;
      notify("Intervjuplanen er låst opp for redigering.");
      return true;
    } catch (error) {
      if (isSensitiveAuthorityChangedError(error)) return false;
      if (handleAuthorizationFailure(error)) return false;
      const message = isConflictError(error)
        ? CONFLICT_MESSAGE
        : scheduleSaveErrorMessage(
            error,
            "Kunne ikke låse opp intervjuplanen. Prøv igjen.",
          );
      setPlanTransitionError(message);
      notify(message, "error");
      return false;
    } finally {
      setPlanTransition(null);
    }
  };

  const replacePanelMember = async (
    scheduleIndex: number,
    panelMemberIndex: number,
    replacement: { id?: string; name: string },
  ) => {
    if (!savedSchedule) return false;
    const schedule = [...savedSchedule.schedule];
    const item = { ...schedule[scheduleIndex] };
    const panel = [...item.panel];
    panel[panelMemberIndex] = {
      ...panel[panelMemberIndex],
      id: replacement.id,
      name: replacement.name,
    };
    item.panel = panel;
    item.locked = true;
    item.booking_source = "manual";
    schedule[scheduleIndex] = item;
    return saveScheduleRows(
      schedule,
      "Panelmedlem byttet.",
      "Kunne ikke bytte panelmedlem.",
    );
  };

  const replaceBlockPanelMember = async (
    scheduleIndexes: number[],
    oldMemberName: string,
    replacement: { id?: string; name: string },
  ) => {
    if (!savedSchedule || scheduleIndexes.length === 0) return false;
    const schedule = [...savedSchedule.schedule];
    let changed = false;
    scheduleIndexes.forEach((scheduleIndex) => {
      const item = schedule[scheduleIndex];
      if (!item) return;
      const panelMemberIndex = item.panel.findIndex((m) =>
        m.id && replacement.id
          ? m.id === replacement.id || m.name === oldMemberName
          : m.name === oldMemberName,
      );
      if (panelMemberIndex === -1) return;
      const panel = [...item.panel];
      panel[panelMemberIndex] = {
        ...panel[panelMemberIndex],
        id: replacement.id,
        name: replacement.name,
      };
      schedule[scheduleIndex] = {
        ...item,
        panel,
        locked: true,
        booking_source: "manual",
      };
      changed = true;
    });
    if (!changed) return false;
    return saveScheduleRows(
      schedule,
      `Panelmedlem byttet for ${scheduleIndexes.length} intervju${scheduleIndexes.length === 1 ? "" : "er"} i blokken.`,
      "Kunne ikke bytte panelmedlem for blokken.",
    );
  };

  const updateOutreachTemplates = async (
    outreachTemplates: InterviewOutreachTemplates,
  ) => {
    if (!savedSchedule) return false;
    try {
      await saveSchedule.mutateAsync({
        outreach_templates: outreachTemplates,
        expected_updated_at: savedSchedule.updated_at,
      });
      if (areSensitiveAdmissionCacheWritesBlocked(scope)) return false;
      return true;
    } catch (error) {
      if (isSensitiveAuthorityChangedError(error)) return false;
      if (handleAuthorizationFailure(error)) return false;
      return false;
    }
  };

  const changeInterviewTime = async (
    scheduleIndex: number,
    nextTime: number,
  ) => {
    if (!savedSchedule) return false;
    const schedule = [...savedSchedule.schedule];
    schedule[scheduleIndex] = {
      ...schedule[scheduleIndex],
      time: nextTime,
      locked: true,
      booking_source: "manual",
    };
    return saveScheduleRows(
      schedule,
      "Tidspunkt endret.",
      "Kunne ikke endre tidspunkt.",
    );
  };

  const toggleLock = async (scheduleIndex: number) => {
    if (!savedSchedule) return false;
    const schedule = [...savedSchedule.schedule];
    const item = {
      ...schedule[scheduleIndex],
      locked: !schedule[scheduleIndex].locked,
    };
    if (!item.locked && item.booking_source === "manual") {
      item.booking_source = "solver";
    }
    schedule[scheduleIndex] = item;
    return saveScheduleRows(
      schedule,
      item.locked ? "Raden er låst." : "Raden er låst opp.",
      "Kunne ikke oppdatere låsing.",
    );
  };

  const setBookingSource = async (
    scheduleIndex: number,
    source: "solver" | "manual",
  ) => {
    if (!savedSchedule) return false;
    const schedule = [...savedSchedule.schedule];
    schedule[scheduleIndex] = {
      ...schedule[scheduleIndex],
      booking_source: source,
      ...(source === "manual" ? { locked: true } : {}),
    };
    return saveScheduleRows(
      schedule,
      source === "manual"
        ? "Intervjuet er markert som manuelt avtalt og låst."
        : "Intervjuet er markert som solverforslag.",
      "Kunne ikke oppdatere bookingtypen.",
    );
  };

  const swapCandidates = async (
    sourceScheduleIndex: number,
    targetScheduleIndex: number,
  ) => {
    if (!savedSchedule) return false;
    const schedule = [...savedSchedule.schedule];
    const source = schedule[sourceScheduleIndex];
    const target = schedule[targetScheduleIndex];
    if (!source || !target) return false;
    schedule[sourceScheduleIndex] = {
      ...source,
      candidate: target.candidate,
      candidate_id: target.candidate_id,
      interview_status: target.interview_status,
      interview_status_updated_at: target.interview_status_updated_at,
      interview_status_updated_by: target.interview_status_updated_by,
      candidate_phone: target.candidate_phone,
      locked: true,
      booking_source: "manual",
    };
    schedule[targetScheduleIndex] = {
      ...target,
      candidate: source.candidate,
      candidate_id: source.candidate_id,
      interview_status: source.interview_status,
      interview_status_updated_at: source.interview_status_updated_at,
      interview_status_updated_by: source.interview_status_updated_by,
      candidate_phone: source.candidate_phone,
      locked: true,
      booking_source: "manual",
    };
    return saveScheduleRows(
      schedule,
      `Byttet plass på ${source.candidate} og ${target.candidate}.`,
      "Kunne ikke bytte kandidater.",
    );
  };

  return {
    publishSchedule,
    extendDistributedThrough,
    unlockSchedule,
    planTransition,
    planTransitionError,
    scheduleFieldError,
    clearUnpublishedDraft,
    setNameVisibility,
    replacePanelMember,
    replaceBlockPanelMember,
    updateOutreachTemplates,
    changeInterviewTime,
    swapCandidates,
    toggleLock,
    setBookingSource,
  };
};
