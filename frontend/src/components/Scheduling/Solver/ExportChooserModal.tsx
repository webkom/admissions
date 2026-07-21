import React, { useEffect, useRef } from "react";
import { Calendar, CalendarDays, FileSpreadsheet } from "lucide-react";
import { useFocusTrap } from "../ConfirmDialog";
import { iconSizes } from "src/styles/designTokens";

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
    className="group flex w-full items-center gap-3 rounded-lg border border-border-soft bg-surface-base px-4 py-3 text-left transition-[border-color,background] duration-100 hover:border-border-quiet hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
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
      className="fixed inset-0 z-modal flex items-center justify-center overflow-y-auto bg-overlay px-4 py-4 animate-overlay-fade-in"
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
        className="max-h-modal w-full max-w-md overflow-y-auto rounded-panel border border-border bg-surface-base p-5 shadow-modal focus:outline-none animate-fade-in"
      >
        <h4
          id="export-chooser-title"
          className="m-0 text-base font-bold text-text-primary"
        >
          Velg eksportmåte
        </h4>
        <p className="mb-0 mt-2 text-ui text-text-muted">
          Kalenderfiler bruker anonyme kandidatnavn. CSV kan inneholde navn og
          må behandles som konfidensiell informasjon.
        </p>
        <div className="mt-4 grid gap-2">
          <ExportOption
            icon={<Calendar size={iconSizes.standard} />}
            title="Apple Calendar / Outlook"
            hint="Åpner .ics-filen direkte"
            onClick={() => {
              onExportIcs("apple");
              onClose();
            }}
          />
          <ExportOption
            icon={<CalendarDays size={iconSizes.standard} />}
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
                icon={<FileSpreadsheet size={iconSizes.standard} />}
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
