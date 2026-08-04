import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

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
import {
  areSensitiveAdmissionCacheWritesBlocked,
  captureSensitiveAdmissionAuthorityEpoch,
  isSensitiveAuthorityChangedError,
  isSensitiveAdmissionAuthorityEpochCurrent,
  purgeSensitiveAdmissionAccess,
} from "src/query/sensitiveAccess";
import { apiClient } from "src/utils/callApi";

export type DraftSaveState = "idle" | "saving" | "saved" | "error" | "conflict";

export interface DraftPersistenceStatus {
  state: DraftSaveState;
  error: string;
  hasLocalDraft: boolean;
  isSaving: boolean;
  hasConflict: boolean;
  isSaved: boolean;
}

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
  onConflict: () => void;
  onRevisionSaved: (revision: string) => void;
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
  onRevisionSaved,
  onSaved,
}: UseScheduleDraftPersistenceParams) => {
  const queryClient = useQueryClient();
  const onRevisionSavedRef = useRef(onRevisionSaved);
  const onConflictRef = useRef(onConflict);
  const onSavedRef = useRef(onSaved);
  const saveSchedule = useSaveSchedule(config.admissionSlug, {
    onCanonicalScheduleSaved: (schedule) =>
      onRevisionSavedRef.current(schedule.updated_at),
  });
  const mutateAsyncRef = useRef(saveSchedule.mutateAsync);
  const [state, setState] = useState<DraftSaveState>(
    savedSchedule?.schedule.length ? "saved" : "idle",
  );
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
  const scheduleQueryKey = [
    `/admin/admission/${config.admissionSlug}/schedule/`,
  ];

  useEffect(() => {
    mutateAsyncRef.current = saveSchedule.mutateAsync;
  }, [saveSchedule.mutateAsync]);

  useEffect(() => {
    onRevisionSavedRef.current = onRevisionSaved;
    onConflictRef.current = onConflict;
    onSavedRef.current = onSaved;
  }, [onConflict, onRevisionSaved, onSaved]);

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
      inFlightFingerprintRef.current = pending.fingerprint;
      setState("saving");
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
          onSavedRef.current(saved.updated_at);
          setState("saved");
        }
      } catch (saveError) {
        if (isSensitiveAuthorityChangedError(saveError)) {
          pendingRef.current = null;
          failedRef.current = null;
          writeUncertainRef.current = false;
          setState("idle");
          setError("");
          inFlightFingerprintRef.current = null;
          break;
        }
        const latestPending = pendingRef.current ?? pending;
        pendingRef.current = null;
        failedRef.current = latestPending;
        if (isConflictError(saveError)) {
          writeUncertainRef.current = false;
          setState("conflict");
          setError(CONFLICT_MESSAGE);
          onConflictRef.current();
        } else {
          writeUncertainRef.current = true;
          setState("error");
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
  }, []);

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

  useEffect(() => {
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
      setState("saved");
      setError("");
      if (revisionRef.current) onSavedRef.current(revisionRef.current);
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
    setState("saving");
    setError("");

    if (timerRef.current) clearTimeout(timerRef.current);
    const generatedNow = lastScheduledSolveTickRef.current !== solveTick;
    lastScheduledSolveTickRef.current = solveTick;
    timerRef.current = setTimeout(
      () => {
        timerRef.current = null;
        void savePendingDrafts();
      },
      generatedNow ? 0 : 400,
    );
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

  useEffect(
    () => () => {
      if (!timerRef.current) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
      void savePendingDrafts();
    },
    [savePendingDrafts],
  );

  const pendingMatchesCanonicalSchedule = (
    pending: PendingDraft,
    canonical: SavedSchedule,
  ) =>
    JSON.stringify({
      schedule: canonical.schedule,
      start_date: canonical.start_date,
      end_date: canonical.end_date,
      session_duration: canonical.session_duration,
      enabled_windows: canonical.enabled_windows,
      enabled_slots: canonical.enabled_slots,
      day_start_minute: canonical.day_start_minute,
      day_end_minute: canonical.day_end_minute,
      chunk_size: canonical.chunk_size,
      chunk_break_minutes: canonical.chunk_break_minutes,
      slot_overrides: canonical.slot_overrides,
      panel_size: canonical.panel_size,
      solver_options: canonical.solver_options,
      is_distributed: canonical.is_distributed,
    }) === JSON.stringify(pending.payload);

  const reconcileUncertainWrite = async (pending: PendingDraft) => {
    const authorityEpoch = captureSensitiveAdmissionAuthorityEpoch(
      config.admissionSlug,
    );
    try {
      const { data: canonical } = await apiClient.get<SavedSchedule>(
        `/admin/admission/${config.admissionSlug}/schedule/`,
      );
      if (
        areSensitiveAdmissionCacheWritesBlocked(config.admissionSlug) ||
        !isSensitiveAdmissionAuthorityEpochCurrent(
          config.admissionSlug,
          authorityEpoch,
        )
      ) {
        return;
      }
      queryClient.setQueryData(scheduleQueryKey, canonical);
      if (!pendingMatchesCanonicalSchedule(pending, canonical)) {
        failedRef.current = pending;
        writeUncertainRef.current = false;
        setState("conflict");
        setError(CONFLICT_MESSAGE);
        onConflictRef.current();
        return;
      }
      revisionRef.current = canonical.updated_at;
      lastSavedFingerprintRef.current = pending.fingerprint;
      lastSavedRevisionRef.current = canonical.updated_at;
      failedRef.current = null;
      writeUncertainRef.current = false;
      onRevisionSavedRef.current(canonical.updated_at);
      if (pending.fingerprint === latestFingerprintRef.current) {
        onSavedRef.current(canonical.updated_at);
        setState("saved");
        setError("");
      }
    } catch (error) {
      if (
        !isSensitiveAdmissionAuthorityEpochCurrent(
          config.admissionSlug,
          authorityEpoch,
        )
      ) {
        return;
      }
      if (
        purgeSensitiveAdmissionAccess(
          queryClient,
          config.admissionSlug,
          error,
          { scopeForbiddenToAdmission: true },
        )
      ) {
        return;
      }
      setState("error");
      setError(
        "Kunne ikke kontrollere om utkastet ble lagret. Prøv igjen for å kontrollere på nytt.",
      );
    }
  };

  const retry = () => {
    if (!failedRef.current || state === "conflict") return;
    if (writeUncertainRef.current) {
      void reconcileUncertainWrite(failedRef.current);
      return;
    }
    pendingRef.current = failedRef.current;
    failedRef.current = null;
    void savePendingDrafts();
  };

  const status: DraftPersistenceStatus = {
    state,
    error,
    hasLocalDraft,
    isSaving: state === "saving",
    hasConflict: state === "conflict" || remoteRevisionChanged,
    isSaved:
      state === "saved" ||
      (!hasLocalDraft && Boolean(savedSchedule?.schedule.length)),
  };

  return { ...status, retry };
};

export type ScheduleDraftPersistence = ReturnType<
  typeof useScheduleDraftPersistence
>;
