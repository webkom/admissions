import React, { useEffect, useRef } from "react";
import { Calendar, CalendarDays, FileSpreadsheet } from "lucide-react";
import { useFocusTrap } from "../ConfirmDialog";

interface ExportChooserModalProps {
  onExportIcs: (target: "apple" | "google") => void;
  onExportCsv: () => void;
  onClose: () => void;
  showCsv?: boolean;
}

interface ExportOptionProps {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}

const ExportOption = ({ icon, title, hint, onClick }: ExportOptionProps) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex w-full items-center gap-3 rounded-xl border border-border-soft bg-surface-base px-4 py-3 text-left transition-[border-color,background,transform] duration-150 hover:-translate-y-px hover:border-brand-strongBorder hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ring"
  >
    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-surface-muted text-text-muted transition-colors group-hover:bg-brand-muted group-hover:text-brand">
      {icon}
    </span>
    <span className="min-w-0">
      <span className="block text-ui font-bold text-text-primary">{title}</span>
      <span className="block text-detail text-text-muted">{hint}</span>
    </span>
  </button>
);

const ExportChooserModal = ({
  onExportIcs,
  onExportCsv,
  onClose,
  showCsv = true,
}: ExportChooserModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, true);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 animate-[overlay-fade-in_0.15s_ease-out]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-chooser-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-panel border border-border bg-surface-base p-5 shadow-modal focus:outline-none animate-[fade-in_0.18s_ease-out]"
      >
        <h4
          id="export-chooser-title"
          className="m-0 text-base font-bold text-text-primary"
        >
          Velg eksportmåte
        </h4>
        <p className="mb-0 mt-2 text-ui text-text-muted">
          Last ned intervjuplanen til kalenderen din eller som regneark.
        </p>
        <div className="mt-4 grid gap-2">
          <ExportOption
            icon={<Calendar size={18} />}
            title="Apple Calendar / Outlook"
            hint="Åpner .ics-filen direkte"
            onClick={() => {
              onExportIcs("apple");
              onClose();
            }}
          />
          <ExportOption
            icon={<CalendarDays size={18} />}
            title="Google Calendar"
            hint="Importer .ics-filen via innstillinger"
            onClick={() => {
              onExportIcs("google");
              onClose();
            }}
          />
          {showCsv && (
            <>
              <div className="my-1 h-px bg-border-faint" />
              <ExportOption
                icon={<FileSpreadsheet size={18} />}
                title="CSV-fil"
                hint="For Excel eller Google Sheets"
                onClick={() => {
                  onExportCsv();
                  onClose();
                }}
              />
            </>
          )}
          <button
            type="button"
            className="mt-2 text-sm font-semibold text-text-muted hover:text-text-primary"
            onClick={onClose}
          >
            Avbryt
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportChooserModal;
