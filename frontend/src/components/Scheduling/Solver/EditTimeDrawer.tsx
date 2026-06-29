import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import cn from "src/utils/cn";
import { useFocusTrap } from "../ConfirmDialog";
import {
  CustomSelect,
  actionButtonBase,
  actionButtonNeutral,
  actionButtonPrimary,
  sectionLabelClass,
} from "../ui";

interface EditTimeDrawerProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  onConfirm: () => void;
  onClose: () => void;
  confirmBusy?: boolean;
}

const EditTimeDrawer = ({
  value,
  onChange,
  options,
  onConfirm,
  onClose,
  confirmBusy = false,
}: EditTimeDrawerProps) => {
  const drawerRef = useRef<HTMLElement>(null);

  useFocusTrap(drawerRef, true);

  useEffect(() => {
    drawerRef.current
      ?.querySelector<HTMLElement>("#edit-time-select button")
      ?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // window, not document: CustomSelect stops Escape at document while its
    // listbox is open, so the first press only closes the dropdown.
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-overlay animate-[overlay-fade-in_0.2s_ease-out]"
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-time-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-surface-base shadow-drawer-left animate-[slide-in-right_0.22s_cubic-bezier(0.16,1,0.3,1)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border-soft px-5 py-4">
          <div className="min-w-0">
            <h4
              id="edit-time-title"
              className="m-0 text-base font-bold text-text-primary"
            >
              Endre tid
            </h4>
            <p className="mb-0 mt-1 text-detail text-text-muted">
              Velg en ledig tidsluke. Raden markeres som manuelt endret og
              beholdes neste gang planen genereres.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            className="inline-flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
          >
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <label htmlFor="edit-time-select" className={sectionLabelClass}>
            Tidsluke
          </label>
          <CustomSelect
            id="edit-time-select"
            value={value}
            onChange={onChange}
            options={options}
          />
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-border-soft px-5 py-4">
          <p className="m-0 hidden text-detail text-text-subtle sm:block">
            {value ? "Raden låses som manuelt endret." : "Velg en tidsluke."}
          </p>
          <div className="flex flex-none items-center gap-2">
            <button
              type="button"
              className={cn(actionButtonBase, actionButtonNeutral)}
              onClick={onClose}
            >
              Avbryt
            </button>
            <button
              type="button"
              className={cn(actionButtonBase, actionButtonPrimary)}
              onClick={onConfirm}
              disabled={!value || confirmBusy}
            >
              {confirmBusy ? "Lagrer…" : "Lagre tid"}
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
};

export default EditTimeDrawer;
