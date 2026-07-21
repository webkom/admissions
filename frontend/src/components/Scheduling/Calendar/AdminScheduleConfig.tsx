import React, { useCallback, useEffect, useRef, useState } from "react";
import { LayoutPanelTop } from "lucide-react";
import {
  buildBlockTimeChunks,
  buildBlockTimeSlots,
  dateRangeDates,
  enabledWindowsToSlots,
  makeSlotKey,
  slotsToEnabledWindows,
} from "../scheduleUtils";
import {
  SchedulePanel,
  SchedulePanelBody,
  SchedulePanelHeader,
  type TimeValue,
} from "../ui";
import type { EnabledWindow } from "../types";
import { isConflictError } from "../Solver/solverHelpers";
import AdminAvailabilityGrid from "./AdminAvailabilityGrid";
import AdminScheduleSettingsPanel, {
  AdminScheduleConfigFooter,
} from "./AdminScheduleSettingsPanel";
import {
  CHUNK_BREAK_LIMITS,
  getDateRangeState,
  getScheduleConfigChangeState,
  getTotalInterviewSlotCount,
  isDurationPreset,
  isPausePreset,
  MAX_RANGE_DAYS,
  normalizeSourceWindows,
  parseIntegerInRange,
  SESSION_DURATION_LIMITS,
  type ScheduleConfigBaseline,
  shapeDraftSlots,
} from "./adminScheduleConfigModel";

interface AdminScheduleConfigProps {
  activeTab: "framework" | "availability" | "coverage";
  startDate: string;
  endDate: string;
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  enabledWindows: EnabledWindow[];
  enabledSlots: Set<string>;
  hasScheduleDraft?: boolean;
  onSave?: (config: ScheduleConfigInput) => Promise<string>;
  onSaveSuccess?: () => void;
  scheduleRevision: string | null;
  sessionDuration: number;
  onDraftStatusChange?: (status: {
    hasPendingChanges: boolean;
    isValid: boolean;
  }) => void;
}

export interface ScheduleConfigInput {
  startDate: string;
  endDate: string;
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  enabledSlots: string[];
  enabledWindows: EnabledWindow[];
  expectedUpdatedAt: string | null;
  sessionDuration: number;
}

const AdminScheduleConfig: React.FC<AdminScheduleConfigProps> = ({
  activeTab,
  startDate,
  endDate,
  dayStartMinute,
  dayEndMinute,
  chunkSize,
  chunkBreakMinutes,
  enabledWindows,
  enabledSlots,
  hasScheduleDraft = false,
  onSave,
  onSaveSuccess,
  onDraftStatusChange,
  scheduleRevision,
  sessionDuration,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [saveTick, setSaveTick] = useState(0);
  const [reshapedSlotCount, setReshapedSlotCount] = useState(0);
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);

  const [pendingStart, setPendingStart] = useState<TimeValue>({
    h: Math.floor(dayStartMinute / 60),
    m: dayStartMinute % 60,
  });
  const [pendingEnd, setPendingEnd] = useState<TimeValue>({
    h: Math.floor(dayEndMinute / 60),
    m: dayEndMinute % 60,
  });
  const durationIsPreset = isDurationPreset(sessionDuration);
  const [pendingDuration, setPendingDuration] = useState(sessionDuration);
  const [customDurationInput, setCustomDurationInput] = useState(
    durationIsPreset ? "" : String(sessionDuration),
  );
  const [isCustomDuration, setIsCustomDuration] = useState(!durationIsPreset);

  const [pendingChunkSize, setPendingChunkSize] = useState(chunkSize);
  const [pendingChunkBreak, setPendingChunkBreak] = useState(chunkBreakMinutes);
  const pauseIsPreset = isPausePreset(chunkBreakMinutes);
  const [customPauseInput, setCustomPauseInput] = useState(
    pauseIsPreset ? "" : String(chunkBreakMinutes),
  );
  const [isCustomPause, setIsCustomPause] = useState(!pauseIsPreset);

  const [localStartDate, setLocalStartDate] = useState(startDate);
  const [localEndDate, setLocalEndDate] = useState(endDate);
  const [draftSlots, setDraftSlots] = useState<Set<string>>(() => {
    const sourceWindows = normalizeSourceWindows(
      enabledWindows,
      enabledSlots,
      sessionDuration,
    );
    return new Set(enabledWindowsToSlots(sourceWindows, sessionDuration));
  });
  const [baseline, setBaseline] = useState<ScheduleConfigBaseline>(() => ({
    startDate,
    endDate,
    dayStartMinute,
    dayEndMinute,
    chunkSize,
    chunkBreakMinutes,
    enabledWindows: normalizeSourceWindows(
      enabledWindows,
      enabledSlots,
      sessionDuration,
    ),
    sessionDuration,
  }));
  const [baseRevision, setBaseRevision] = useState(scheduleRevision);
  const [remoteRevisionChanged, setRemoteRevisionChanged] = useState(false);
  const [pendingSavedRevision, setPendingSavedRevision] = useState<
    string | null
  >(null);

  const startMinute = pendingStart.h * 60 + pendingStart.m;
  const endMinute = pendingEnd.h * 60 + pendingEnd.m;
  const isInvalidRange = startMinute >= endMinute;
  const customDurationValue = parseIntegerInRange(
    customDurationInput,
    SESSION_DURATION_LIMITS.min,
    SESSION_DURATION_LIMITS.max,
    SESSION_DURATION_LIMITS.step,
  );
  const customPauseValue = parseIntegerInRange(
    customPauseInput,
    CHUNK_BREAK_LIMITS.min,
    CHUNK_BREAK_LIMITS.max,
    CHUNK_BREAK_LIMITS.step,
  );
  const durationInputInvalid = isCustomDuration && customDurationValue === null;
  const pauseInputInvalid = isCustomPause && customPauseValue === null;
  const hasInvalidNumericInput = durationInputInvalid || pauseInputInvalid;
  const dates = React.useMemo(
    () => dateRangeDates(localStartDate, localEndDate, MAX_RANGE_DAYS),
    [localStartDate, localEndDate],
  );

  const timeSlots = React.useMemo(() => {
    if (isInvalidRange) return [];
    return buildBlockTimeSlots({
      dayStartMinute: startMinute,
      dayEndMinute: endMinute,
      sessionDuration: pendingDuration,
      chunkSize: pendingChunkSize,
      chunkBreakMinutes: pendingChunkBreak,
    });
  }, [
    startMinute,
    endMinute,
    pendingDuration,
    pendingChunkSize,
    pendingChunkBreak,
    isInvalidRange,
  ]);

  const chunks = React.useMemo(() => {
    if (isInvalidRange) return [];
    return buildBlockTimeChunks({
      dayStartMinute: startMinute,
      dayEndMinute: endMinute,
      sessionDuration: pendingDuration,
      chunkSize: pendingChunkSize,
      chunkBreakMinutes: pendingChunkBreak,
    });
  }, [
    startMinute,
    endMinute,
    pendingDuration,
    pendingChunkSize,
    pendingChunkBreak,
    isInvalidRange,
  ]);

  // A shape change needs one overlap-based migration from the previous grid.
  // Keep the result as the editable source of truth so toggling a block cannot
  // be undone by re-deriving it from merged windows on the next render.
  const gridShapeKey = React.useMemo(
    () =>
      JSON.stringify({
        dates,
        startMinute,
        endMinute,
        sessionDuration: pendingDuration,
        chunkBreakMinutes: pendingChunkBreak,
        chunkSize: pendingChunkBreak > 0 ? pendingChunkSize : null,
      }),
    [
      dates,
      endMinute,
      pendingChunkBreak,
      pendingChunkSize,
      pendingDuration,
      startMinute,
    ],
  );
  const previousGridShapeKey = useRef(gridShapeKey);

  useEffect(() => {
    if (previousGridShapeKey.current === gridShapeKey) return;
    previousGridShapeKey.current = gridShapeKey;
    setDraftSlots((currentSlots) => {
      const nextSlots = shapeDraftSlots(
        dates,
        chunks,
        currentSlots,
        pendingDuration,
      );
      setReshapedSlotCount(
        Array.from(currentSlots).filter((slot) => !nextSlots.has(slot)).length,
      );
      return nextSlots;
    });
  }, [chunks, dates, gridShapeKey, pendingDuration]);

  const normalizedDraftWindows = React.useMemo(
    () => slotsToEnabledWindows(draftSlots, pendingDuration),
    [draftSlots, pendingDuration],
  );
  const { isValid: dateRangeValid, isTooLong: dateRangeTooLong } =
    getDateRangeState(localStartDate, localEndDate);
  const { hasPendingChanges, gridDefiningChange, visualGroupingChange } =
    getScheduleConfigChangeState({
      baseline,
      startDate: localStartDate,
      endDate: localEndDate,
      startMinute,
      endMinute,
      sessionDuration: pendingDuration,
      chunkSize: pendingChunkSize,
      chunkBreakMinutes: pendingChunkBreak,
      enabledWindows: normalizedDraftWindows,
      hasInvalidNumericInput,
    });
  const isInitialCreate =
    baseRevision === null &&
    scheduleRevision === null &&
    pendingSavedRevision === null;
  const saveDisabled =
    (!hasPendingChanges && !isInitialCreate) ||
    hasInvalidNumericInput ||
    pendingDuration < SESSION_DURATION_LIMITS.min ||
    pendingDuration > SESSION_DURATION_LIMITS.max ||
    pendingChunkBreak < CHUNK_BREAK_LIMITS.min ||
    pendingChunkBreak > CHUNK_BREAK_LIMITS.max ||
    isInvalidRange ||
    !dateRangeValid ||
    remoteRevisionChanged;

  const applyIncomingConfiguration = useCallback(() => {
    const nextWindows = normalizeSourceWindows(
      enabledWindows,
      enabledSlots,
      sessionDuration,
    );
    const nextDurationIsPreset = isDurationPreset(sessionDuration);
    const nextPauseIsPreset = isPausePreset(chunkBreakMinutes);

    setLocalStartDate(startDate);
    setLocalEndDate(endDate);
    setPendingStart({
      h: Math.floor(dayStartMinute / 60),
      m: dayStartMinute % 60,
    });
    setPendingEnd({
      h: Math.floor(dayEndMinute / 60),
      m: dayEndMinute % 60,
    });
    setPendingDuration(sessionDuration);
    setCustomDurationInput(nextDurationIsPreset ? "" : String(sessionDuration));
    setIsCustomDuration(!nextDurationIsPreset);
    setPendingChunkSize(chunkSize);
    setPendingChunkBreak(chunkBreakMinutes);
    setCustomPauseInput(nextPauseIsPreset ? "" : String(chunkBreakMinutes));
    setIsCustomPause(!nextPauseIsPreset);
    setDraftSlots(new Set(enabledWindowsToSlots(nextWindows, sessionDuration)));
    setBaseline({
      startDate,
      endDate,
      dayStartMinute,
      dayEndMinute,
      chunkSize,
      chunkBreakMinutes,
      enabledWindows: nextWindows,
      sessionDuration,
    });
    setBaseRevision(scheduleRevision);
    setPendingSavedRevision(null);
    setRemoteRevisionChanged(false);
    setReshapedSlotCount(0);
  }, [
    chunkBreakMinutes,
    chunkSize,
    dayEndMinute,
    dayStartMinute,
    enabledSlots,
    enabledWindows,
    endDate,
    scheduleRevision,
    sessionDuration,
    startDate,
  ]);

  useEffect(() => {
    if (isSaving) return;
    if (pendingSavedRevision !== null) {
      if (scheduleRevision === baseRevision) return;
      if (scheduleRevision === pendingSavedRevision) {
        applyIncomingConfiguration();
        return;
      }
      setRemoteRevisionChanged(true);
      return;
    }
    if (scheduleRevision === baseRevision) return;
    if (hasPendingChanges) {
      setRemoteRevisionChanged(true);
      return;
    }
    applyIncomingConfiguration();
  }, [
    applyIncomingConfiguration,
    baseRevision,
    hasPendingChanges,
    isSaving,
    pendingSavedRevision,
    scheduleRevision,
  ]);

  useEffect(() => {
    if (!hasPendingChanges) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasPendingChanges]);

  const handleChangeSlots = useCallback(
    (slots: Set<string>) => setDraftSlots(new Set(slots)),
    [],
  );

  const handleSave = async () => {
    if (!onSave || saveDisabled) return;
    if (
      gridDefiningChange &&
      !window.confirm(
        "Endringen sletter all registrert tilgjengelighet og nullstiller eksisterende intervjuforslag. Vil du fortsette?",
      )
    )
      return;
    setIsSaving(true);
    try {
      const nextConfig: ScheduleConfigInput = {
        startDate: localStartDate,
        endDate: localEndDate,
        dayStartMinute: startMinute,
        dayEndMinute: endMinute,
        chunkSize: pendingChunkSize,
        chunkBreakMinutes: pendingChunkBreak,
        enabledSlots: enabledWindowsToSlots(
          normalizedDraftWindows,
          pendingDuration,
        ),
        enabledWindows: normalizedDraftWindows,
        expectedUpdatedAt: baseRevision,
        sessionDuration: pendingDuration,
      };
      const savedRevision = await onSave(nextConfig);
      setBaseline({
        startDate: nextConfig.startDate,
        endDate: nextConfig.endDate,
        dayStartMinute: nextConfig.dayStartMinute,
        dayEndMinute: nextConfig.dayEndMinute,
        chunkSize: nextConfig.chunkSize,
        chunkBreakMinutes: nextConfig.chunkBreakMinutes,
        enabledWindows: nextConfig.enabledWindows,
        sessionDuration: nextConfig.sessionDuration,
      });
      setPendingSavedRevision(savedRevision);
      setRemoteRevisionChanged(false);
      setSaveTick((tick) => tick + 1);
      setIsSettingsCollapsed(true);
      onSaveSuccess?.();
    } catch (error) {
      if (isConflictError(error)) setRemoteRevisionChanged(true);
      return;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDurationPreset = (value: number) => {
    setPendingDuration(value);
    setCustomDurationInput("");
    setIsCustomDuration(false);
  };

  const handleCustomDurationInput = (raw: string) => {
    setCustomDurationInput(raw);
    setIsCustomDuration(true);
    const value = parseIntegerInRange(
      raw,
      SESSION_DURATION_LIMITS.min,
      SESSION_DURATION_LIMITS.max,
      SESSION_DURATION_LIMITS.step,
    );
    if (value !== null) setPendingDuration(value);
  };

  const handlePausePreset = (value: number) => {
    setPendingChunkBreak(value);
    setIsCustomPause(false);
    setCustomPauseInput("");
  };

  const handleCustomPauseInput = (raw: string) => {
    setCustomPauseInput(raw);
    setIsCustomPause(true);
    const value = parseIntegerInRange(
      raw,
      CHUNK_BREAK_LIMITS.min,
      CHUNK_BREAK_LIMITS.max,
      CHUNK_BREAK_LIMITS.step,
    );
    if (value !== null) setPendingChunkBreak(value);
  };

  const openBlockCount = dates.reduce(
    (total, date) =>
      total +
      chunks.filter((chunk) =>
        chunk.some((minute) => draftSlots.has(makeSlotKey(date, minute))),
      ).length,
    0,
  );
  const saveStatus = {
    hasPendingChanges,
    gridDefiningChange,
    visualGroupingChange,
    hasScheduleDraft,
    remoteRevisionChanged,
    isSaving,
    saveTick,
    showSave: Boolean(onSave),
    saveDisabled,
    discardDisabled: scheduleRevision === baseRevision,
    onDiscard: applyIncomingConfiguration,
    onSave: handleSave,
    openBlockCount,
    reshapedSlotCount,
  };

  useEffect(() => {
    onDraftStatusChange?.({
      hasPendingChanges,
      isValid: dateRangeValid && !isInvalidRange && !hasInvalidNumericInput,
    });
  }, [
    dateRangeValid,
    hasInvalidNumericInput,
    hasPendingChanges,
    isInvalidRange,
    onDraftStatusChange,
  ]);
  const settings = (
    <AdminScheduleSettingsPanel
      embedded
      period={{
        startDate: localStartDate,
        endDate: localEndDate,
        isValid: dateRangeValid,
        isTooLong: dateRangeTooLong,
        onChangeStartDate: setLocalStartDate,
        onChangeEndDate: setLocalEndDate,
      }}
      duration={{
        value: pendingDuration,
        isCustom: isCustomDuration,
        onSelectPreset: handleDurationPreset,
        onCommitCustomValue: (value) =>
          handleCustomDurationInput(String(value)),
      }}
      dailyTime={{
        start: pendingStart,
        end: pendingEnd,
        isInvalid: isInvalidRange,
        onChangeStart: setPendingStart,
        onChangeEnd: setPendingEnd,
      }}
      block={{
        size: pendingChunkSize,
        onChangeSize: setPendingChunkSize,
        pause: {
          value: pendingChunkBreak,
          isCustom: isCustomPause,
          onSelectPreset: handlePausePreset,
          onCommitCustomValue: (value) => handleCustomPauseInput(String(value)),
        },
      }}
      saveStatus={saveStatus}
      collapsed={isSettingsCollapsed}
      onEdit={() => setIsSettingsCollapsed(false)}
    />
  );

  return (
    <div
      id="foundation-panel-framework"
      role="tabpanel"
      aria-labelledby="foundation-tab-framework"
      hidden={activeTab !== "framework"}
      className={activeTab === "framework" ? "flex flex-col gap-3" : "hidden"}
    >
      <SchedulePanel className="min-w-0">
        <SchedulePanelHeader
          icon={LayoutPanelTop}
          title="Tidsrammer"
          description="Definer når intervjuer kan gjennomføres og hvordan blokkene bygges."
        />
        <SchedulePanelBody>{settings}</SchedulePanelBody>
      </SchedulePanel>
      <SchedulePanel id="interview-blocks" className="min-w-0 scroll-mt-4">
        <SchedulePanelHeader
          icon={LayoutPanelTop}
          title="Intervjublokker"
          description="Velg hvilke blokker som skal være åpne."
        />
        <AdminAvailabilityGrid
          dates={dates}
          timeSlots={timeSlots}
          chunks={chunks}
          enabledSlots={draftSlots}
          sessionDuration={pendingDuration}
          totalInterviewSlotCount={getTotalInterviewSlotCount(
            dateRangeValid && !isInvalidRange && !hasInvalidNumericInput,
            dates.length,
            timeSlots.length,
          )}
          onChangeSlots={handleChangeSlots}
        />
      </SchedulePanel>
      <AdminScheduleConfigFooter
        saveStatus={saveStatus}
        actionLabel="Lagre oppsett"
        className="sticky bottom-3 z-10 rounded-panel border border-border bg-surface-base shadow-lg"
      />
    </div>
  );
};

export default AdminScheduleConfig;
