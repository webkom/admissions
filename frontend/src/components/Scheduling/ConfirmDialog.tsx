import React, { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import cn from "src/utils/cn";
import {
  actionButtonBase,
  actionButtonDanger,
  actionButtonNeutral,
  actionButtonPrimary,
} from "./ui";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab/Shift+Tab focus cycling inside `ref` while `active` is true. */
export const useFocusTrap = (
  ref: React.RefObject<HTMLElement>,
  active: boolean,
) => {
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const initial = node.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (initial ?? node).focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusables = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !node.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", handleKey);
    return () => {
      node.removeEventListener("keydown", handleKey);
      previousFocus?.focus?.();
    };
  }, [ref, active]);
};

interface ConfirmDialogProps {
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  confirmDisabled?: boolean;
  busy?: boolean;
  /** "danger" switches the confirm button to the destructive variant and, when
   *  no icon is supplied, shows a warning glyph so the severity reads at a glance. */
  tone?: "default" | "danger";
  icon?: React.ReactNode;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  children,
  confirmLabel,
  cancelLabel = "Avbryt",
  onConfirm,
  onClose,
  confirmDisabled = false,
  busy = false,
  tone = "default",
  icon,
}) => {
  const isDanger = tone === "danger";
  const resolvedIcon = icon ?? (isDanger ? <AlertTriangle size={18} /> : null);
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
        aria-label={title}
        tabIndex={-1}
        className="w-full max-w-md rounded-panel border border-border bg-surface-base p-5 shadow-modal focus:outline-none animate-[fade-in_0.18s_ease-out]"
      >
        <div className="flex items-start gap-3">
          {resolvedIcon && (
            <span
              aria-hidden="true"
              className={cn(
                "flex h-9 w-9 flex-none items-center justify-center rounded-lg",
                isDanger
                  ? "bg-danger-bg text-danger"
                  : "bg-brand-muted text-brand",
              )}
            >
              {resolvedIcon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="m-0 text-base font-bold text-text-primary">
              {title}
            </h4>
            {children && (
              <div className="mt-2 text-ui text-text-muted">{children}</div>
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className={cn(actionButtonBase, actionButtonNeutral)}
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={cn(
              actionButtonBase,
              isDanger ? actionButtonDanger : actionButtonPrimary,
            )}
            onClick={onConfirm}
            disabled={confirmDisabled || busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
