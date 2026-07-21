import { useState } from "react";
import type { StatusToastState } from "src/components/StatusToast";
import { useQueryClient } from "@tanstack/react-query";
import {
  CONFLICT_MESSAGE,
  isConflictError,
  scheduleSaveErrorMessage,
} from "src/components/Scheduling/Solver/solverHelpers";
import { useSaveSchedule } from "src/query/hooks";
import type { NameVisibility, SavedSchedule, ScheduleItem } from "src/types";
import {
  areSensitiveAdmissionCacheWritesBlocked,
  purgeSensitiveAuthorizationFailure,
} from "src/query/sensitiveAccess";

type Notify = (message: string, tone?: StatusToastState["tone"]) => void;

interface DistributedPlanActionsParams {
  admissionSlug: string;
  savedSchedule: SavedSchedule | undefined;
  notify: Notify;
}

export const useDistributedPlanActions = ({
  admissionSlug,
  savedSchedule,
  notify,
}: DistributedPlanActionsParams) => {
  const queryClient = useQueryClient();
  const saveSchedule = useSaveSchedule(admissionSlug);
  const [planTransition, setPlanTransition] = useState<
    "publishing" | "unlocking" | null
  >(null);
  const [planTransitionError, setPlanTransitionError] = useState("");
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

  const saveScheduleRows = async (
    schedule: ScheduleItem[],
    successMessage: string,
    errorMessage: string,
  ) => {
    if (!savedSchedule) return false;
    try {
      await saveSchedule.mutateAsync({
        schedule,
        is_distributed: savedSchedule.is_distributed,
        expected_updated_at: savedSchedule.updated_at,
      });
      if (areSensitiveAdmissionCacheWritesBlocked(admissionSlug)) return false;
      notify(successMessage);
      return true;
    } catch (error) {
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

  const setNameVisibility = async (visibility: NameVisibility) => {
    if (!savedSchedule) return false;
    try {
      await saveSchedule.mutateAsync({
        name_visibility: visibility,
        expected_updated_at: savedSchedule.updated_at,
      });
      if (areSensitiveAdmissionCacheWritesBlocked(admissionSlug)) return false;
      notify("Synlighet oppdatert.");
      return true;
    } catch (error) {
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

  const publishSchedule = async (visibility: NameVisibility) => {
    if (!savedSchedule || savedSchedule.schedule.length === 0) return false;
    setPlanTransition("publishing");
    setPlanTransitionError("");
    try {
      await saveSchedule.mutateAsync({
        is_distributed: true,
        name_visibility: visibility,
        expected_updated_at: savedSchedule.updated_at,
      });
      if (areSensitiveAdmissionCacheWritesBlocked(admissionSlug)) return false;
      notify("Intervjuplanen er publisert for komiteen.");
      return true;
    } catch (error) {
      if (handleAuthorizationFailure(error)) return false;
      const message = isConflictError(error)
        ? CONFLICT_MESSAGE
        : scheduleSaveErrorMessage(
            error,
            "Kunne ikke publisere intervjuplanen. Prøv igjen.",
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
      if (areSensitiveAdmissionCacheWritesBlocked(admissionSlug)) return false;
      notify("Intervjuplanen er låst opp for redigering.");
      return true;
    } catch (error) {
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

  return {
    publishSchedule,
    unlockSchedule,
    planTransition,
    planTransitionError,
    setNameVisibility,
    replacePanelMember,
    changeInterviewTime,
    toggleLock,
    setBookingSource,
  };
};
