import React, { useEffect, useId, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";

import { useFocusTrap } from "./ConfirmDialog";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";

interface ScheduleDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClassName?: string;
  dataCy?: string;
}

const ScheduleDrawer = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  widthClassName = "sm:max-w-lg",
  dataCy,
}: ScheduleDrawerProps) => {
  const drawerRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }, [open]);

  useFocusTrap(drawerRef, open);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => {
      const preferred = drawerRef.current?.querySelector<HTMLElement>(
        "[data-autofocus], button:not([disabled]), input:not([disabled])",
      );
      preferred?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCloseRef.current();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      const opener = openerRef.current;
      openerRef.current = null;
      window.requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus();
      });
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        data-cy={dataCy ? `${dataCy}-backdrop` : undefined}
        className="fixed inset-0 z-modal bg-overlay animate-overlay-fade-in motion-reduce:animate-none"
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        data-cy={dataCy}
        className={cn(
          "fixed inset-0 z-drawer flex w-full flex-col bg-surface-base shadow-drawer-left animate-slide-in-right motion-reduce:animate-none sm:inset-y-0 sm:left-auto sm:border-l sm:border-border",
          widthClassName,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border-soft px-5 py-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="m-0 text-lg font-bold tracking-tight text-text-primary"
            >
              {title}
            </h2>
            {description && (
              <p
                id={descriptionId}
                className="m-0 mt-1 max-w-prose text-ui leading-relaxed text-text-muted"
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring active:translate-y-px"
          >
            <X size={iconSizes.medium} aria-hidden="true" />
          </button>
        </header>
        <div
          data-cy={dataCy ? `${dataCy}-body` : undefined}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-5"
        >
          {children}
        </div>
        {footer && (
          <footer className="flex-none border-t border-border-soft bg-surface-base px-5 py-4">
            {footer}
          </footer>
        )}
      </aside>
    </>
  );
};

export default ScheduleDrawer;
