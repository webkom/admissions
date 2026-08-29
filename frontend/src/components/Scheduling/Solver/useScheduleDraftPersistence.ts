import { useCallback, useEffect, useRef, useState } from "react";

import { useSaveSchedule } from "../../../query/hooks";
import type {
  EnabledWindow,
  ManualScheduleBlock,
  SavedSchedule,
  ScheduleBlockMode,
  SlotOverride,
  SolverOptions,
} from "../types";
import {
  CONFLICT_MESSAGE,
  hasSchedule,
  isConflictError,
  scheduleSaveErrorMessage,
  type SolveResponse,
} from "./solverHelpers";
import { isSensitiveAuthorityChangedError } from "src/query/sensitiveAccess";

export type DraftSaveState = "idle" | "saving" | "saved" | "error" | "conflict";

export interface DraftPersistenceStatus {
  state: DraftSaveState;
  error: string;
  hasLocalDraft: boolean;
  isSaving: boolean;
  hasConflict: boolean;
  isSaved: boolean;
  saveNow?: () => Promise<boolean>;
}

interface DraftPersistenceConfig {
  admissionSlug: string;
  groupId: string;
  startDate: string;
  endDate: string;
  sessionDuration: number;
  enabledWindows: EnabledWindow[];
  enabledSlots: Set<string>;
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  blockMode: ScheduleBlockMode;
  manualBlocks: ManualScheduleBlock[];
  slotOverrides: SlotOverride[];
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
    slot_overrides: SlotOverride[];
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
  /** The plan was generated from mock/synthetic input: its interviewers do
   *  not exist in the backend, so the draft can never save. The enqueue
   *  guard below turns the auto-save into a clear message instead of the
   *  backend's confusing "ukjent intervjuer" rejection. */
  syntheticInput?: boolean;
  onConflict: () => void;
  onRevisionSaved: (revision: string) => void;
  onSaved: (revision: string, touchedScheduleIndexes: number[]) => void;
  /** Rows the user edited since the last completed save, drained on read
   *  (see useScheduleDraft.consumeTouchedScheduleIndexes). */
  getTouchedScheduleIndexes?: () => number[];
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
  syntheticInput = false,
  onConflict,
  onRevisionSaved,
  onSaved,
  getTouchedScheduleIndexes,
}: UseScheduleDraftPersistenceParams) => {
  const onRevisionSavedRef = useRef(onRevisionSaved);
  const onConflictRef = useRef(onConflict);
  const onSavedRef = useRef(onSaved);
  const touchedIndexesRef = useRef(getTouchedScheduleIndexes);
  const saveSchedule = useSaveSchedule(config.admissionSlug, config.groupId, {
    onCanonicalScheduleSaved: (schedule) =>
      onRevisionSavedRef.current(schedule.updated_at),
  });
  const mutateAsyncRef = useRef(saveSchedule.mutateAsync);
  const [state, setState] = useState<DraftSaveState>(
    savedSchedule?.schedule.length ? "saved" : "idle",
  );
  // Mirror of `state` for callbacks that branch on the latest value without
  // re-rendering (the auto-save queue runs inside effects and timers).
  const stateRef = useRef<DraftSaveState>(state);
  const updateState = useCallback((next: DraftSaveState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  const [error, setError] = useState("");
  const pendingRef = useRef<PendingDraft | null>(null);
  const failedRef = useRef<PendingDraft | null>(null);
  const writeUncertainRef = useRef(false);
  const inFlightRef = useRef(false);
  const inFlightFingerprintRef = useRef<string | null>(null);
  const revisionRef = useRef<string | null>(draftBaseRevision);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedFingerprintRef = useRef("");
  const lastSavedRevisionRef = useRef<string | null>(null);
  const latestFingerprintRef = useRef("");
  const lastScheduledSolveTickRef = useRef(solveTick);

  useEffect(() => {
    mutateAsyncRef.current = saveSchedule.mutateAsync;
  }, [saveSchedule.mutateAsync]);

  useEffect(() => {
    onRevisionSavedRef.current = onRevisionSaved;
    onConflictRef.current = onConflict;
    onSavedRef.current = onSaved;
    touchedIndexesRef.current = getTouchedScheduleIndexes;
  }, [onConflict, onRevisionSaved, onSaved, getTouchedScheduleIndexes]);

  useEffect(() => {
    if (!inFlightRef.current) revisionRef.current = draftBaseRevision;
  }, [draftBaseRevision]);

  useEffect(() => {
    if (!hasLocalDraft && savedSchedule?.schedule.length) {
      updateState("saved");
      setError("");
    }
  }, [hasLocalDraft, savedSchedule?.schedule.length, updateState]);

  const savePendingDrafts = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    while (pendingRef.current) {
      const pending = pendingRef.current;
      pendingRef.current = null;
      inFlightFingerprintRef.current = pending.fingerprint;
      updateState("saving");
      setError("");

      try {
        const saved = await mutateAsyncRef.current({
          ...pending.payload,
          expected_updated_at: revisionRef.current,
        });
        revisionRef.current = saved.updated_at;
        lastSavedFingerprintRef.current = pending.fingerprint;
        lastSavedRevisionRef.current = saved.updated_at;
        failedRef.current = null;
        writeUncertainRef.current = false;
        if (
          !pendingRef.current &&
          pending.fingerprint === latestFingerprintRef.current
        ) {
          onSavedRef.current(
            saved.updated_at,
            touchedIndexesRef.current?.() ?? [],
          );
          updateState("saved");
        }
      } catch (saveError) {
        if (isSensitiveAuthorityChangedError(saveError)) {
          pendingRef.current = null;
          failedRef.current = null;
          writeUncertainRef.current = false;
          updateState("idle");
          setError("");
          inFlightFingerprintRef.current = null;
          break;
        }
        const latestPending = pendingRef.current ?? pending;
        pendingRef.current = null;
        failedRef.current = latestPending;
        if (isConflictError(saveError)) {
          writeUncertainRef.current = false;
          updateState("conflict");
          setError(CONFLICT_MESSAGE);
          onConflictRef.current();
        } else {
          writeUncertainRef.current = true;
          updateState("error");
          setError(
            scheduleSaveErrorMessage(
              saveError,
              "Kunne ikke lagre utkastet. Prøv igjen.",
            ),
          );
        }
        inFlightFingerprintRef.current = null;
        break;
      }
      inFlightFingerprintRef.current = null;
    }

    inFlightRef.current = false;
  }, [updateState]);

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
    blockMode: config.blockMode,
    manualBlocks: config.manualBlocks,
    slotOverrides: config.slotOverrides,
    panelSize: config.panelSize,
    solverOptions: config.solverOptions,
  });
  latestFingerprintRef.current = fingerprint;

  const SIMULATED_PLAN_SAVE_BLOCKED =
    "Simulerte planer kan ikke lagres — de inneholder fiktive intervjuere " +
    "som ikke finnes i systemet. Skru av «Simuler testdata» og generer på " +
    "nytt med ekte data for å kunne lagre.";

  useEffect(() => {
    if (syntheticInput) {
      pendingRef.current = null;
      failedRef.current = null;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (state !== "error" || error !== SIMULATED_PLAN_SAVE_BLOCKED) {
        updateState("error");
        setError(SIMULATED_PLAN_SAVE_BLOCKED);
      }
      return;
    }
    const persistenceUnavailable =
      !hasLocalDraft ||
      loading ||
      remoteRevisionChanged ||
      savedSchedule?.is_distributed ||
      schedule.length === 0;
    if (persistenceUnavailable) {
      pendingRef.current = null;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // The queue-time "saving" state below is optimistic: the debounced
      // request has not started yet. If the draft became unpersistable in
      // that window, dropping the pending draft used to leave "saving"
      // pointing at nothing - no request in flight, nothing queued - so
      // `isSaving` stayed true forever and every further action deadlocked
      // behind "Vent til endringene i utkastet er lagret" with no retry.
      // Fall back to "idle" so the queueing effect re-runs (and re-saves)
      // once the unavailable condition clears.
      if (!inFlightRef.current && stateRef.current === "saving") {
        updateState("idle");
        setError("");
      }
      return;
    }
    if (fingerprint === inFlightFingerprintRef.current) {
      pendingRef.current = null;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    if (
      fingerprint === lastSavedFingerprintRef.current &&
      !inFlightRef.current &&
      !failedRef.current &&
      !writeUncertainRef.current &&
      revisionRef.current === lastSavedRevisionRef.current
    ) {
      pendingRef.current = null;
      failedRef.current = null;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      updateState("saved");
      setError("");
      // Already persisted and unchanged: report the revision without touch
      // information, so the view does not replay a row highlight for a save
      // that did not happen just now.
      if (revisionRef.current) onSavedRef.current(revisionRef.current, []);
      return;
    }
    if (fingerprint === failedRef.current?.fingerprint) return;
    // A saving-state render must not cancel the debounce for the same draft.
    if (fingerprint === pendingRef.current?.fingerprint) return;

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
        slot_overrides: config.slotOverrides,
        panel_size: config.panelSize,
        solver_options: config.solverOptions,
        is_distributed: false,
      },
    };
    failedRef.current = null;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const generatedNow = lastScheduledSolveTickRef.current !== solveTick;
    lastScheduledSolveTickRef.current = solveTick;

    if (generatedNow) {
      updateState("saving");
      setError("");
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void savePendingDrafts();
      }, 0);
    } else {
      // User manual edits: do NOT auto-save. Keep draft locally and wait for manual save via saveNow().
      updateState("idle");
      setError("");
    }
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
    syntheticInput,
    updateState,
  ]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      pendingRef.current = null;
    },
    [],
  );

  const retry = () => {
    if (!failedRef.current || stateRef.current === "conflict") return;
    pendingRef.current = failedRef.current;
    failedRef.current = null;
    void savePendingDrafts();
  };

  /** Drop all local-draft save bookkeeping and re-sync with the schedule
   *  currently on the server. Used by the regeneration panel's "Last inn
   *  siste versjon" action: the session hook discards the local result and
   *  reveals the remote schedule, and this clears the conflict/failed state
   *  that otherwise deadlocked the panel. The remote revision flows back
   *  via draftBaseRevision → revisionRef, so any later save sends the
   *  correct expected_updated_at. */
  const adoptRemote = useCallback(() => {
    if (inFlightRef.current) return;
    pendingRef.current = null;
    failedRef.current = null;
    writeUncertainRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    inFlightFingerprintRef.current = null;
    setError("");
    updateState(savedSchedule?.schedule.length ? "saved" : "idle");
  }, [savedSchedule?.schedule.length, updateState]);

  const saveNow = useCallback(async () => {
    if (inFlightRef.current) return false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    updateState("saving");
    setError("");
    await savePendingDrafts();
    return true;
  }, [savePendingDrafts, updateState]);

  const status: DraftPersistenceStatus = {
    state,
    error,
    hasLocalDraft,
    isSaving: state === "saving",
    hasConflict: state === "conflict" || remoteRevisionChanged,
    isSaved:
      state === "saved" ||
      (!hasLocalDraft && Boolean(savedSchedule?.schedule.length)),
    saveNow,
  };

  return { ...status, retry, adoptRemote, saveNow };
};

export type ScheduleDraftPersistence = ReturnType<
  typeof useScheduleDraftPersistence
>;
