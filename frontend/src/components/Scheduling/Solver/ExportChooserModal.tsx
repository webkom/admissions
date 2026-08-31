import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  CalendarDays,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { useFocusTrap } from "../ConfirmDialog";
import { iconSizes } from "src/styles/designTokens";
import {
  actionButtonBase,
  actionButtonPrimary,
  keyboardFocusRingClass,
} from "../ui";
import { MultiSelect } from "src/components/ui";
import cn from "src/utils/cn";
import type { ScheduleCsvFields } from "src/routes/SchedulePage/distributedPlanExports";

interface ExportChooserModalProps {
  onExportIcs: (target: "apple" | "google") => void;
  /** Download the CSV with the chosen columns. */
  onExportCsv: (fields: ScheduleCsvFields) => void;
  /** True where this committee's søknadstekst can be included (opptaksansvarlig,
   *  full plan). Off hides that column entirely. */
  csvTextAvailable?: boolean;
  /** The texts are still being fetched; the column is offered but disabled. */
  csvTextLoading?: boolean;
  /** Whether candidate names are shown on the plan - the name column defaults
   *  to matching that. */
  namesShownByDefault?: boolean;
  onClose: () => void;
  showCsv?: boolean;
  /**
   * When true, the modal only offers "mine" exports — the user is not an
   * opptaksansvarlig and must not be able to surface the full plan or
   * anything CSV-shaped.
   */
  restrictToMyInterviews?: boolean;
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

const CSV_FIELD_KEYS = [
  "showNames",
  "panel",
  "status",
  "applicationText",
] as const;

const ExportChooserModal = ({
  onExportIcs,
  onExportCsv,
  csvTextAvailable = false,
  csvTextLoading = false,
  namesShownByDefault = false,
  onClose,
  showCsv = true,
  restrictToMyInterviews = false,
}: ExportChooserModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, true);

  const [selectedFields, setSelectedFields] = useState<string[]>(() => [
    ...(namesShownByDefault ? ["showNames"] : []),
    "panel",
    "status",
  ]);

  const fieldOptions = useMemo(
    () => [
      // Scrubbing down is always allowed; naming up is not. When the plan is
      // set to hide candidate names, the export honours that - otherwise the
      // picker would quietly become a way around the plan-wide setting, and
      // "navn skjult" would mean nothing the moment someone opened this modal.
      {
        value: "showNames",
        label: namesShownByDefault
          ? "Kandidatnavn"
          : "Kandidatnavn (skjult på planen)",
        disabled: !namesShownByDefault,
      },
      { value: "panel", label: "Panel" },
      { value: "status", label: "Intervjustatus" },
      ...(csvTextAvailable
        ? [
            {
              value: "applicationText",
              label: csvTextLoading ? "Søknadstekst (hentes…)" : "Søknadstekst",
              disabled: csvTextLoading,
            },
          ]
        : []),
    ],
    [csvTextAvailable, csvTextLoading, namesShownByDefault],
  );

  const fields: ScheduleCsvFields = {
    showNames: selectedFields.includes("showNames"),
    panel: selectedFields.includes("panel"),
    status: selectedFields.includes("status"),
    applicationText: selectedFields.includes("applicationText"),
  };

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
          className="m-0 text-title font-bold text-text-primary"
        >
          {restrictToMyInterviews
            ? "Eksporter dine intervjuer"
            : "Velg eksportmåte"}
        </h4>
        {showCsv && !restrictToMyInterviews && (
          <p className="mb-0 mt-2 text-ui text-text-muted">
            Kalenderfiler bruker anonyme kandidatnavn. CSV kan inneholde navn og
            må behandles som konfidensiell informasjon.
          </p>
        )}
        {restrictToMyInterviews && (
          <p className="mb-0 mt-2 text-ui text-text-muted">
            Du kan bare eksportere dine egne intervjuer. Opptaksansvarlig
            bestemmer hva som deles videre.
          </p>
        )}
        <div className="mt-4 grid gap-2">
          <ExportOption
            icon={<Calendar size={iconSizes.standard} />}
            title="Apple Calendar / Outlook"
            hint={
              restrictToMyInterviews
                ? "Åpner .ics-filen med dine intervjuer"
                : "Åpner .ics-filen direkte"
            }
            onClick={() => {
              onExportIcs("apple");
              onClose();
            }}
          />
          <ExportOption
            icon={<CalendarDays size={iconSizes.standard} />}
            title="Google Calendar"
            hint={
              restrictToMyInterviews
                ? "Importer dine intervjuer via innstillinger"
                : "Importer .ics-filen via innstillinger"
            }
            onClick={() => {
              onExportIcs("google");
              onClose();
            }}
          />

          {showCsv && !restrictToMyInterviews && (
            <>
              <div className="my-1 h-px bg-border-faint" />
              <div className="rounded-lg border border-border-soft bg-surface-base px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-surface-muted text-text-muted">
                    <FileSpreadsheet size={iconSizes.standard} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-ui font-bold text-text-primary">
                      CSV-fil
                    </span>
                    <span className="block text-detail text-text-muted">
                      For Excel eller Google Sheets
                    </span>
                  </span>
                </div>
                <label className="mt-3 block text-detail font-semibold text-text-subtle">
                  Kolonner
                </label>
                <MultiSelect
                  className="mt-1"
                  values={selectedFields}
                  onChange={(next) =>
                    setSelectedFields(
                      CSV_FIELD_KEYS.filter((key) => next.includes(key)),
                    )
                  }
                  options={fieldOptions}
                  getSelectionLabel={(selected) =>
                    selected.length === 0
                      ? "Bare tidspunkt og kandidat"
                      : selected.map((option) => option.label).join(", ")
                  }
                  selectAllLabel="Velg alle"
                  clearAllLabel="Fjern alle"
                  aria-label="Velg kolonner for CSV"
                />
                <p className="m-0 mt-2 text-detail leading-relaxed text-text-muted">
                  {fields.showNames
                    ? "Kandidatnavn tas med."
                    : "Kandidatene anonymiseres som «Kandidat 1», «Kandidat 2» …"}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onExportCsv(fields);
                    onClose();
                  }}
                  className={cn(
                    actionButtonBase,
                    actionButtonPrimary,
                    "mt-3 w-full justify-center",
                  )}
                >
                  <Download size={iconSizes.small} aria-hidden="true" />
                  Last ned CSV
                </button>
              </div>
            </>
          )}
          <button
            type="button"
            className={`mt-2 text-ui font-semibold text-text-muted hover:text-text-primary ${keyboardFocusRingClass}`}
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
