import React from "react";
import { createPortal } from "react-dom";

import cn from "src/utils/cn";

interface CalendarPopoverDialogProps {
  open: boolean;
  dialogRef: React.RefObject<HTMLDivElement>;
  isCompact: boolean;
  dialogStyle: React.CSSProperties;
  titleId: string;
  describedById?: string;
  dataCy: string;
  dataDisplayedMonth?: string;
  className: string;
  compactClassName: string;
  onRequestClose: () => void;
  children: React.ReactNode;
}

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export const CalendarPopoverDialog: React.FC<CalendarPopoverDialogProps> = ({
  open,
  dialogRef,
  isCompact,
  dialogStyle,
  titleId,
  describedById,
  dataCy,
  dataDisplayedMonth,
  className,
  compactClassName,
  onRequestClose,
  children,
}) => {
  React.useEffect(() => {
    if (!open || !isCompact) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCompact, open]);

  if (!open || typeof document === "undefined") return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onRequestClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    ).filter(
      (element) =>
        !element.hasAttribute("aria-hidden") &&
        element.getAttribute("tabindex") !== "-1",
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[var(--modal-layer)]",
        isCompact ? "bg-overlay backdrop-blur-sm" : "bg-transparent",
      )}
      onPointerDown={onRequestClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedById}
        data-cy={dataCy}
        data-displayed-month={dataDisplayedMonth}
        className={cn(className, isCompact ? compactClassName : "rounded-lg")}
        style={dialogStyle}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};
