import React, { useCallback, useEffect, useRef, useState } from "react";
import { LayoutPanelTop } from "lucide-react";
import cn from "src/utils/cn";
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
  actionButtonBase,
  actionButtonGhost,
  type TimeValue,
} from "../ui";
import type { EnabledWindow, SlotOverride } from "../types";
import { isConflictError } from "../Solver/solverHelpers";
import AdminAvailabilityGrid from "./AdminAvailabilityGrid";
import AdminScheduleSettingsPanel, {
  AdminScheduleConfigFooter,
} from "./AdminScheduleSettingsPanel";
import {
  canonicalizeSlotOverrides,
  buildFineTuneTimeSlots,
  CHUNK_BREAK_LIMITS,
  closeAllScheduleCapacity,
  deriveScheduleDraftSummary,
  deriveSlotOverrides,
  getDateRangeState,
  getScheduleConfigChangeState,
  isDurationPreset,
  isPausePreset,
  MAX_RANGE_DAYS,
  normalizeSourceWindows,
  openAllStandardBlocks,
  parseIntegerInRange,
  preserveManualDraftSlots,
  rebuildBaseForBlockPattern,
  reconstructBaseSlots,
  setDayStandardBlocksOpen,
  setStandardBlockOpen,
  SESSION_DURATION_LIMITS,
  toggleFineTuneSlot,
  type ScheduleConfigBaseline,
  type ScheduleDraftState,
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
  layoutVersion: number;
  slotOverrides: SlotOverride[];
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
  slotOverrides?: SlotOverride[];
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
  layoutVersion,
  slotOverrides,
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
  const [editorView, setEditorView] = useState<"blocks" | "fine">("blocks");
  const [layoutResetRequested, setLayoutResetRequested] = useState(false);
  const legacyLayoutLocked = layoutVersion < 2 && !layoutResetRequested;

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
  const [draftOverrides, setDraftOverrides] = useState<SlotOverride[]>(() =>
    canonicalizeSlotOverrides(slotOverrides),
  );
  const draftStateRef = useRef<ScheduleDraftState>({
    enabledSlots: draftSlots,
    slotOverrides: draftOverrides,
  });
  draftStateRef.current = {
    enabledSlots: draftSlots,
    slotOverrides: draftOverrides,
  };
  const [baseline, setBaseline] = useState<ScheduleConfigBaseline>(() => ({
    startDate,
    endDate,
    dayStartMinute,
    dayEndMinute,
    chunkSize,
    chunkBreakMinutes,
    slotOverrides: canonicalizeSlotOverrides(slotOverrides),
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

  const manualTimeSlots = React.useMemo(() => {
    if (isInvalidRange) return [];
    return buildFineTuneTimeSlots(chunks, pendingDuration);
  }, [chunks, isInvalidRange, pendingDuration]);

  const gridShape = React.useMemo(
    () => ({
      key: JSON.stringify({
        dates,
        startMinute,
        endMinute,
        sessionDuration: pendingDuration,
        chunkBreakMinutes: pendingChunkBreak,
        chunkSize: pendingChunkSize,
      }),
      sessionDuration: pendingDuration,
      chunkBreakMinutes: pendingChunkBreak,
      chunkSize: pendingChunkSize,
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
  const previousGridShape = useRef(gridShape);

  useEffect(() => {
    if (previousGridShape.current.key === gridShape.key) return;
    const previous = previousGridShape.current;
    previousGridShape.current = gridShape;
    setDraftSlots((currentSlots) => {
      const previousBase = reconstructBaseSlots(currentSlots, draftOverrides);
      const durationChanged =
        previous.sessionDuration !== gridShape.sessionDuration;
      const blockPatternChanged =
        previous.chunkSize !== gridShape.chunkSize ||
        previous.chunkBreakMinutes !== gridShape.chunkBreakMinutes;
      let nextSlots: Set<string>;
      if (durationChanged) {
        nextSlots = shapeDraftSlots(
          dates,
          chunks,
          currentSlots,
          pendingDuration,
        );
        setDraftOverrides([]);
      } else if (blockPatternChanged) {
        nextSlots = rebuildBaseForBlockPattern(dates, chunks, previousBase);
        setDraftOverrides([]);
      } else {
        nextSlots = preserveManualDraftSlots(
          dates,
          manualTimeSlots,
          currentSlots,
        );
        const nextBase = preserveManualDraftSlots(
          dates,
          manualTimeSlots,
          previousBase,
        );
        setDraftOverrides(deriveSlotOverrides(nextSlots, nextBase));
      }
      setReshapedSlotCount(
        Array.from(currentSlots).filter((slot) => !nextSlots.has(slot)).length,
      );
      return nextSlots;
    });
  }, [
    chunks,
    dates,
    draftOverrides,
    gridShape,
    manualTimeSlots,
    pendingDuration,
  ]);

  const normalizedDraftWindows = React.useMemo(
    () => slotsToEnabledWindows(draftSlots, pendingDuration),
    [draftSlots, pendingDuration],
  );
  const { isValid: dateRangeValid, isTooLong: dateRangeTooLong } =
    getDateRangeState(localStartDate, localEndDate);
  const {
    hasPendingChanges: configurationHasPendingChanges,
    gridDefiningChange,
    proposalInvalidatingChange: modelProposalInvalidatingChange,
    blockStructureChange,
    visualGroupingChange,
    availabilityAddition,
    availabilityRemoval,
  } = getScheduleConfigChangeState({
    baseline,
    startDate: localStartDate,
    endDate: localEndDate,
    startMinute,
    endMinute,
    sessionDuration: pendingDuration,
    chunkSize: pendingChunkSize,
    chunkBreakMinutes: pendingChunkBreak,
    slotOverrides: draftOverrides,
    enabledWindows: normalizedDraftWindows,
    hasInvalidNumericInput,
  });
  const hasPendingChanges =
    configurationHasPendingChanges || layoutResetRequested;
  const proposalInvalidatingChange =
    modelProposalInvalidatingChange || layoutResetRequested;
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
    setEditorView("blocks");
    setCustomPauseInput(nextPauseIsPreset ? "" : String(chunkBreakMinutes));
    setIsCustomPause(!nextPauseIsPreset);
    const nextSlots = new Set(
      enabledWindowsToSlots(nextWindows, sessionDuration),
    );
    setDraftSlots(nextSlots);
    setDraftOverrides(canonicalizeSlotOverrides(slotOverrides));
    setBaseline({
      startDate,
      endDate,
      dayStartMinute,
      dayEndMinute,
      chunkSize,
      chunkBreakMinutes,
      slotOverrides: canonicalizeSlotOverrides(slotOverrides),
      enabledWindows: nextWindows,
      sessionDuration,
    });
    setBaseRevision(scheduleRevision);
    setPendingSavedRevision(null);
    setRemoteRevisionChanged(false);
    setReshapedSlotCount(0);
    setLayoutResetRequested(false);
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
    slotOverrides,
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

  const commitDraftState = useCallback((next: ScheduleDraftState) => {
    draftStateRef.current = next;
    setDraftSlots(next.enabledSlots);
    setDraftOverrides(next.slotOverrides);
  }, []);

  const handleSetBlock = useCallback(
    (date: string, minutes: number[], open: boolean) => {
      if (legacyLayoutLocked) return;
      commitDraftState(
        setStandardBlockOpen({
          date,
          minutes,
          open,
          ...draftStateRef.current,
        }),
      );
    },
    [commitDraftState, legacyLayoutLocked],
  );

  const handleToggleSlot = useCallback(
    (date: string, minute: number) => {
      if (legacyLayoutLocked) return;
      commitDraftState(
        toggleFineTuneSlot({
          slot: makeSlotKey(date, minute),
          ...draftStateRef.current,
        }),
      );
    },
    [commitDraftState, legacyLayoutLocked],
  );

  const handleOpenAllStandardBlocks = useCallback(() => {
    if (legacyLayoutLocked) return;
    commitDraftState(
      openAllStandardBlocks({
        dates,
        chunks,
        ...draftStateRef.current,
      }),
    );
  }, [chunks, commitDraftState, dates, legacyLayoutLocked]);

  const handleCloseAllCapacity = useCallback(() => {
    if (legacyLayoutLocked) return;
    commitDraftState(closeAllScheduleCapacity());
  }, [commitDraftState, legacyLayoutLocked]);

  const handleToggleDayStandardBlocks = useCallback(
    (date: string, open: boolean) => {
      if (legacyLayoutLocked) return;
      commitDraftState(
        setDayStandardBlocksOpen({
          date,
          chunks,
          open,
          ...draftStateRef.current,
        }),
      );
    },
    [chunks, commitDraftState, legacyLayoutLocked],
  );

  const handleSave = async () => {
    if (!onSave || saveDisabled) return;
    if (
      gridDefiningChange &&
      !window.confirm(
        "Ny intervjulengde tømmer valgte tider og bekreftelsen, men beholder inhabiliteter. Eksisterende intervjuforslag nullstilles. Vil du fortsette?",
      )
    ) {
      applyIncomingConfiguration();
      return;
    }
    if (
      !gridDefiningChange &&
      proposalInvalidatingChange &&
      hasScheduleDraft &&
      !window.confirm(
        "Endringen kan fjerne eller flytte intervjutider og nullstiller eksisterende intervjuforslag, men beholder registrert tilgjengelighet. Vil du fortsette?",
      )
    ) {
      applyIncomingConfiguration();
      return;
    }
    setIsSaving(true);
    try {
      const nextConfig: ScheduleConfigInput = {
        startDate: localStartDate,
        endDate: localEndDate,
        dayStartMinute: startMinute,
        dayEndMinute: endMinute,
        chunkSize: pendingChunkSize,
        chunkBreakMinutes: pendingChunkBreak,
        slotOverrides:
          layoutVersion >= 2 || layoutResetRequested
            ? canonicalizeSlotOverrides(draftOverrides)
            : undefined,
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
        slotOverrides: nextConfig.slotOverrides ?? [],
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

  const handleResetCustomizations = () => {
    if (legacyLayoutLocked) return;
    if (!window.confirm("Tilbakestille alle finjusteringer i hele perioden?"))
      return;
    commitDraftState({
      enabledSlots: reconstructBaseSlots(
        draftStateRef.current.enabledSlots,
        draftStateRef.current.slotOverrides,
      ),
      slotOverrides: [],
    });
  };

  const handleResetLegacyLayout = () => {
    if (
      !window.confirm(
        "Tilbakestille det eldre blokkoppsettet til dagens standardmønster?",
      )
    )
      return;
    setDraftSlots(
      rebuildBaseForBlockPattern(dates, chunks, new Set(draftSlots)),
    );
    setDraftOverrides([]);
    setLayoutResetRequested(true);
    setEditorView("blocks");
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

  const draftSummary = deriveScheduleDraftSummary({
    dates,
    chunks,
    blockSize: pendingChunkSize,
    enabledSlots: draftSlots,
    slotOverrides: draftOverrides,
  });
  const saveStatus = {
    hasPendingChanges,
    gridDefiningChange,
    proposalInvalidatingChange,
    blockStructureChange,
    visualGroupingChange,
    availabilityAddition,
    availabilityRemoval,
    hasScheduleDraft,
    remoteRevisionChanged,
    isSaving,
    saveTick,
    showSave: Boolean(onSave),
    saveDisabled,
    discardDisabled: scheduleRevision === baseRevision,
    onDiscard: applyIncomingConfiguration,
    onSave: handleSave,
    openBlockCount:
      draftSummary.wholeBlockCount +
      draftSummary.shortBlockCount +
      draftSummary.partialBlockCount,
    customizationCount: draftSummary.manualChangeCount,
    ...draftSummary,
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
      className={
        activeTab === "framework" ? "flex flex-col gap-3 pb-24" : "hidden"
      }
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
          title="Intervjutider"
          description="Velg blokker først, og finjuster bare tidene som trenger et unntak."
        />
        {layoutVersion < 2 && !layoutResetRequested && (
          <div className="mx-5 mt-4 rounded-md border border-warning-border bg-warning-bg px-4 py-3 text-detail text-text-muted">
            <p className="m-0 font-semibold text-text-primary">
              Eldre blokkoppsett
            </p>
            <p className="m-0 mt-1">
              Oppsettet kan brukes av løseren, men må tilbakestilles før
              intervjutidene kan endres.
            </p>
            <button
              type="button"
              className={cn(
                actionButtonBase,
                actionButtonGhost,
                "mt-2 px-0 py-1",
              )}
              onClick={handleResetLegacyLayout}
            >
              Tilbakestill til dagens blokkmønster
            </button>
          </div>
        )}
        <AdminAvailabilityGrid
          dates={dates}
          chunks={chunks}
          blockSize={pendingChunkSize}
          enabledSlots={draftSlots}
          sessionDuration={pendingDuration}
          view={editorView}
          customizationCount={draftOverrides.length}
          fineTuningDisabled={legacyLayoutLocked}
          editingDisabled={legacyLayoutLocked}
          onChangeView={setEditorView}
          onResetCustomizations={handleResetCustomizations}
          onSetBlock={handleSetBlock}
          onToggleSlot={handleToggleSlot}
          onOpenAllStandardBlocks={handleOpenAllStandardBlocks}
          onCloseAllCapacity={handleCloseAllCapacity}
          onToggleDayStandardBlocks={handleToggleDayStandardBlocks}
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
