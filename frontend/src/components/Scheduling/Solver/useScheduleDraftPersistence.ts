import { useCallback, useEffect, useRef, useState } from "react";

import { useSaveSchedule } from "../../../query/hooks";
import type { EnabledWindow, SavedSchedule, SolverOptions } from "../types";
import {
  CONFLICT_MESSAGE,
  hasSchedule,
  isConflictError,
  scheduleSaveErrorMessage,
  type SolveResponse,
} from "./solverHelpers";

type DraftSaveState = "idle" | "saving" | "saved" | "error" | "conflict";

interface DraftPersistenceConfig {
  admissionSlug: string;
  startDate: string;
  endDate: string;
  sessionDuration: number;
  enabledWindows: EnabledWindow[];
  enabledSlots: Set<string>;
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  panelSize: number;
  solverOptions: SolverOptions;
}

interface PendingDraft {
  fingerprint: string;
  payload: {
    schedule: NonNullable<SolveResponse>["schedule"];
    start_date: string;
    end_date: string;
    session_duration: number;
    enabled_windows: EnabledWindow[];
    enabled_slots: string[];
    day_start_minute: number;
    day_end_minute: number;
    chunk_size: number;
    chunk_break_minutes: number;
    panel_size: number;
    solver_options: SolverOptions;
    is_distributed: false;
  };
}

interface UseScheduleDraftPersistenceParams {
  result: SolveResponse | null;
  savedSchedule?: SavedSchedule;
  hasLocalDraft: boolean;
  loading: boolean;
  solveTick: number;
  draftBaseRevision: string | null;
  remoteRevisionChanged: boolean;
  config: DraftPersistenceConfig;
  onConflict: () => void;
  onSaved: (revision: string) => void;
}

export const useScheduleDraftPersistence = ({
  result,
  savedSchedule,
  hasLocalDraft,
  loading,
  solveTick,
  draftBaseRevision,
  remoteRevisionChanged,
  config,
  onConflict,
  onSaved,
}: UseScheduleDraftPersistenceParams) => {
  const saveSchedule = useSaveSchedule(config.admissionSlug);
  const mutateAsyncRef = useRef(saveSchedule.mutateAsync);
  const [state, setState] = useState<DraftSaveState>(
    savedSchedule?.schedule.length ? "saved" : "idle",
  );
  const [error, setError] = useState("");
  const pendingRef = useRef<PendingDraft | null>(null);
  const failedRef = useRef<PendingDraft | null>(null);
  const inFlightRef = useRef(false);
  const revisionRef = useRef<string | null>(draftBaseRevision);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedFingerprintRef = useRef("");
  const lastScheduledSolveTickRef = useRef(solveTick);

  useEffect(() => {
    mutateAsyncRef.current = saveSchedule.mutateAsync;
  }, [saveSchedule.mutateAsync]);

  useEffect(() => {
    if (!inFlightRef.current) revisionRef.current = draftBaseRevision;
  }, [draftBaseRevision]);

  useEffect(() => {
    if (!hasLocalDraft && savedSchedule?.schedule.length) {
      setState("saved");
      setError("");
    }
  }, [hasLocalDraft, savedSchedule?.schedule.length]);

  const savePendingDrafts = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    while (pendingRef.current) {
      const pending = pendingRef.current;
      pendingRef.current = null;
      setState("saving");
      setError("");

      try {
        const saved = await mutateAsyncRef.current({
          ...pending.payload,
          expected_updated_at: revisionRef.current,
        });
        revisionRef.current = saved.updated_at;
        lastSavedFingerprintRef.current = pending.fingerprint;
        failedRef.current = null;
        onSaved(saved.updated_at);
        if (!pendingRef.current) setState("saved");
      } catch (saveError) {
        const latestPending = pendingRef.current ?? pending;
        pendingRef.current = null;
        failedRef.current = latestPending;
        if (isConflictError(saveError)) {
          setState("conflict");
          setError(CONFLICT_MESSAGE);
          onConflict();
        } else {
          setState("error");
          setError(
            scheduleSaveErrorMessage(
              saveError,
              "Kunne ikke lagre utkastet. Prøv igjen.",
            ),
          );
        }
        break;
      }
    }

    inFlightRef.current = false;
  }, [onConflict, onSaved]);

  const schedule = hasSchedule(result?.status) ? result.schedule : [];
  const fingerprint = JSON.stringify({
    schedule,
    startDate: config.startDate,
    endDate: config.endDate,
    sessionDuration: config.sessionDuration,
    enabledWindows: config.enabledWindows,
    enabledSlots: Array.from(config.enabledSlots).sort(),
    dayStartMinute: config.dayStartMinute,
    dayEndMinute: config.dayEndMinute,
    chunkSize: config.chunkSize,
    chunkBreakMinutes: config.chunkBreakMinutes,
    panelSize: config.panelSize,
    solverOptions: config.solverOptions,
  });

  useEffect(() => {
    if (
      !hasLocalDraft ||
      loading ||
      remoteRevisionChanged ||
      savedSchedule?.is_distributed ||
      schedule.length === 0 ||
      fingerprint === lastSavedFingerprintRef.current
    ) {
      return;
    }

    pendingRef.current = {
      fingerprint,
      payload: {
        schedule,
        start_date: config.startDate,
        end_date: config.endDate,
        session_duration: config.sessionDuration,
        enabled_windows: config.enabledWindows,
        enabled_slots: Array.from(config.enabledSlots),
        day_start_minute: config.dayStartMinute,
        day_end_minute: config.dayEndMinute,
        chunk_size: config.chunkSize,
        chunk_break_minutes: config.chunkBreakMinutes,
        panel_size: config.panelSize,
        solver_options: config.solverOptions,
        is_distributed: false,
      },
    };
    failedRef.current = null;
    setState("saving");
    setError("");

    if (timerRef.current) clearTimeout(timerRef.current);
    const generatedNow = lastScheduledSolveTickRef.current !== solveTick;
    lastScheduledSolveTickRef.current = solveTick;
    timerRef.current = setTimeout(
      () => void savePendingDrafts(),
      generatedNow ? 0 : 400,
    );

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    config,
    fingerprint,
    hasLocalDraft,
    loading,
    remoteRevisionChanged,
    savePendingDrafts,
    savedSchedule?.is_distributed,
    schedule,
    solveTick,
  ]);

  const retry = () => {
    if (!failedRef.current || state === "conflict") return;
    pendingRef.current = failedRef.current;
    failedRef.current = null;
    void savePendingDrafts();
  };

  return {
    state,
    error,
    isSaving: state === "saving",
    hasConflict: state === "conflict" || remoteRevisionChanged,
    isSaved:
      state === "saved" ||
      (!hasLocalDraft && Boolean(savedSchedule?.schedule.length)),
    retry,
  };
};

export type ScheduleDraftPersistence = ReturnType<
  typeof useScheduleDraftPersistence
>;
