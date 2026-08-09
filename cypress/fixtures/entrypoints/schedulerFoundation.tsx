import React from "react";
import { createRoot } from "react-dom/client";

import SelectableScheduleGrid from "../../../frontend/src/components/Scheduling/Calendar/SelectableScheduleGrid";
import GridCalendarView from "../../../frontend/src/components/Scheduling/Calendar/GridCalendarView";
import ConfirmDialog from "../../../frontend/src/components/Scheduling/ConfirmDialog";
import WizardTour, {
  useWizardTour,
} from "../../../frontend/src/components/Scheduling/WizardTour";
import {
  ScheduleBlockCell,
  ScheduleGridLegendItem,
  ScheduleSlotSegments,
  scheduleAvailableCellClass,
  scheduleInteractiveCellMotionClass,
  scheduleOpenLegendStyle,
  scheduleSelectedCellClass,
  scheduleSelectionMarkClass,
} from "../../../frontend/src/components/Scheduling/Calendar/ScheduleGridFrame";
import { makeSlotKey } from "../../../frontend/src/components/Scheduling/scheduleUtils";
import {
  EditablePanelChip,
  type SchedulingWorkspaceMode,
} from "../../../frontend/src/components/Scheduling/ui/EditablePanelChip";
import { CalendarMonthGrid } from "../../../frontend/src/components/ui/Calendar/CalendarMonthGrid";
import { CalendarPopoverDialog } from "../../../frontend/src/components/ui/Calendar/CalendarPopoverDialog";
import StatusToast, {
  type StatusToastState,
} from "../../../frontend/src/components/StatusToast";
import "../../../frontend/src/styles/globals.css";
import "../../../frontend/src/styles/scheduler.css";

const dates = ["2026-07-21", "2026-07-22"];
const chunks = [
  [480, 510],
  [600, 630],
];
const selectableSlots = new Set(
  dates.flatMap((date) =>
    chunks.flatMap((chunk) => chunk.map((minute) => makeSlotKey(date, minute))),
  ),
);
const workspaceMode: SchedulingWorkspaceMode = "preview";
const sharedCalendarContracts = {
  CalendarMonthGrid,
  CalendarPopoverDialog,
};
const sharedDialogContracts = {
  ConfirmDialog,
  StatusToast,
  WizardTour,
  useWizardTour,
};
const foundationToast: StatusToastState | null = null;

const SchedulerFoundationHarness: React.FC = () => {
  const [activeSlots, setActiveSlots] = React.useState(
    new Set(chunks[0].map((minute) => makeSlotKey(dates[0], minute))),
  );
  const help = useWizardTour();

  return (
    <main
      data-cy="scheduler-foundation-harness"
      data-workspace-mode={workspaceMode}
      data-calendar-contracts={Object.keys(sharedCalendarContracts).join(",")}
      data-dialog-contracts={Object.keys(sharedDialogContracts).join(",")}
      data-toast-contract={foundationToast === null ? "nullable" : "toast"}
      className="p-6"
    >
      <div className="mb-6 flex justify-end">
        <button
          type="button"
          data-cy="open-scheduler-help"
          onClick={help.open}
          className="rounded-md border border-border-soft bg-surface-base px-3 py-2 text-ui font-semibold text-text-primary"
        >
          Hjelp
        </button>
      </div>
      <WizardTour isOpen={help.isOpen} onClose={help.close} isAdmin />
      <SelectableScheduleGrid
        dates={dates}
        chunks={chunks}
        sessionDuration={30}
        selectableSlots={selectableSlots}
        activeSlots={activeSlots}
        onChangeActiveSlots={setActiveSlots}
        labels={{
          grid: "Delt planleggingsrutenett",
          unavailableCell: "Ikke tilgjengelig",
          cell: ({ date, startMinute }) => `${date}-${startMinute}`,
        }}
      />
      <section
        data-cy="scheduler-foundation-primitives"
        aria-label="Delte rutenettkomponenter"
        className="mt-6 flex flex-wrap items-center gap-3"
      >
        <ScheduleBlockCell
          data-cy="scheduler-foundation-block"
          className={`${scheduleInteractiveCellMotionClass} ${scheduleAvailableCellClass}`}
        >
          <ScheduleSlotSegments fills={[0.25, 1]} />
          <span
            className={`${scheduleSelectionMarkClass} ${scheduleSelectedCellClass}`}
          >
            Valgt
          </span>
        </ScheduleBlockCell>
        <ScheduleGridLegendItem
          label="Ledig"
          swatchClassName={scheduleAvailableCellClass}
          swatchStyle={scheduleOpenLegendStyle}
        />
      </section>
      <section
        data-cy="scheduler-foundation-calendar-view"
        aria-label="Delt planvisning"
        className="mt-6"
      >
        <GridCalendarView
          schedule={[
            {
              candidate: "Kandidat",
              time: 480,
              panel: [{ name: "Ada", is_overtime: false }],
            },
          ]}
          dates={[dates[0]]}
          sessionDuration={30}
          dayStartMinute={480}
          dayEndMinute={540}
          compactSchedule
        />
      </section>
      <section className="mt-6" aria-label="Delt panelbrikke">
        <EditablePanelChip
          label="Ada"
          options={[
            { id: "ada", name: "Ada" },
            { id: "grace", name: "Grace" },
          ]}
          onSelect={() => undefined}
        />
      </section>
    </main>
  );
};

const root = document.getElementById("root");
if (!root) throw new Error("Scheduler foundation fixture root is missing");
createRoot(root).render(<SchedulerFoundationHarness />);

export * from "../../../frontend/src/components/Scheduling/ui";
export * from "../../../frontend/src/components/ui/Calendar";
