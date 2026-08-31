import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Copy, MessageSquare, Send } from "lucide-react";
import { iconSizes, interactionTimings } from "src/styles/designTokens";
import cn from "src/utils/cn";
import { encodeSmsAddress } from "src/utils/emailLinks";

const actionClass =
  "inline-flex min-h-control-sm items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-border-muted bg-surface-base px-2 py-1.5 text-label font-semibold text-text-primary transition-[border-color,box-shadow] duration-150 hover:border-brand-strongBorder focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft";
const shareItemClass =
  "inline-flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-ui font-semibold text-text-primary transition-colors hover:bg-surface-subtle hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring";

const InterviewOutreachActions: React.FC<{
  candidateName: string;
  candidatePhone?: string;
  message: string;
  actionLabel: string;
  canShare: boolean;
  /**
   * Called when the admin actually reaches for a channel - opens the SMS
   * draft or copies the message. Used to advance the interview status the
   * moment the invitation goes out, without a second manual step.
   */
  onSend?: () => void;
}> = ({
  candidateName,
  candidatePhone,
  message,
  actionLabel,
  canShare,
  onSend,
}) => {
  const [copyState, setCopyState] = useState<"copied" | "error" | "none">(
    "none",
  );
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<React.CSSProperties>({});

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const menuWidth = Math.max(rect.width, 224);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpwards = spaceBelow < 280 && spaceAbove > spaceBelow;
    const availableHeight = Math.max(
      120,
      Math.min(448, (openUpwards ? spaceAbove : spaceBelow) - viewportPadding),
    );

    setMenuPosition({
      left: Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - menuWidth - viewportPadding),
      ),
      width: menuWidth,
      top: openUpwards ? undefined : rect.bottom + 6,
      bottom: openUpwards ? window.innerHeight - rect.top + 6 : undefined,
      maxHeight: availableHeight,
    });
  }, []);

  useEffect(() => {
    if (!canShare) {
      setOpen(false);
      return;
    }
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    updateMenuPosition();
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [canShare, open, updateMenuPosition]);

  const copyText = async (value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
      setOpen(false);
      onSend?.();
      window.setTimeout(() => setCopyState("none"), 1200);
    } catch {
      setCopyState("error");
      window.setTimeout(
        () => setCopyState("none"),
        interactionTimings.copiedFeedbackMs,
      );
    }
  };

  const smsRecipient = candidatePhone ? encodeSmsAddress(candidatePhone) : "";
  const sms = smsRecipient
    ? `sms:${smsRecipient}?body=${encodeURIComponent(message)}`
    : undefined;
  const defaultCopyTarget = message;
  const defaultCopyLabel = "Kopier meldingstekst";

  const shareDisabledLabel = !canShare
    ? "Sending er låst til kandidatnavn er synlige for hele komiteen"
    : undefined;

  return (
    <div className="w-full min-w-0">
      <span className="block max-w-full" title={shareDisabledLabel}>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={
            shareDisabledLabel ?? `${actionLabel} til ${candidateName}`
          }
          disabled={!canShare}
          onClick={() => setOpen((isOpen) => !isOpen)}
          className={cn(
            actionClass,
            "max-w-full min-w-0",
            open && "border-brand-input ring-3 ring-brand-ringSoft",
            !canShare && "cursor-not-allowed opacity-60",
          )}
        >
          <Send size={iconSizes.detail} aria-hidden="true" />
          <span className="min-w-0 truncate">{actionLabel}</span>
          <ChevronDown
            size={iconSizes.small}
            className={cn(
              "flex-none text-text-muted transition-transform duration-150",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </span>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={menuPosition}
            role="menu"
            className="fixed z-modal origin-top-left overflow-y-auto rounded-lg border border-border bg-surface-base p-1 shadow-panel animate-fade-in"
          >
            {sms && (
              <a
                href={sms}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSend?.();
                }}
                className={shareItemClass}
              >
                <MessageSquare size={iconSizes.detail} aria-hidden="true" />
                Åpne SMS-utkast
              </a>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => copyText(defaultCopyTarget)}
              className={shareItemClass}
            >
              {copyState === "copied" ? (
                <Check size={iconSizes.detail} aria-hidden="true" />
              ) : (
                <Copy size={iconSizes.detail} aria-hidden="true" />
              )}
              {copyState === "error"
                ? "Kunne ikke kopiere"
                : copyState === "copied"
                  ? "Kopiert tekst"
                  : defaultCopyLabel}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default InterviewOutreachActions;
