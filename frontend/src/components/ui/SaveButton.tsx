import React from "react";
import cn from "src/utils/cn";
import {
  actionButtonBase,
  actionButtonNeutral,
  actionButtonPrimary,
} from "./styles";

type SaveButtonVariant = "primary" | "neutral" | "link";

interface SaveButtonProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "type"
  > {
  isSaving: boolean;
  saveTick?: number;
  succeeded?: boolean;
  variant?: SaveButtonVariant;
  savingLabel?: string;
  savedLabel?: string;
  children: React.ReactNode;
}

export const SaveButton = React.forwardRef<HTMLButtonElement, SaveButtonProps>(
  (
    {
      isSaving,
      saveTick,
      succeeded = true,
      variant = "primary",
      savingLabel = "Lagrer…",
      savedLabel = "Lagret!",
      children,
      className,
      disabled,
      onClick,
      ...rest
    },
    ref,
  ) => {
    const [justSaved, setJustSaved] = React.useState(false);
    const [saveCooldown, setSaveCooldown] = React.useState(false);
    const wasSaving = React.useRef(isSaving);
    const lastTick = React.useRef(saveTick);
    const timeoutRef = React.useRef<number | null>(null);
    const saveInProgressRef = React.useRef(false);
    const [delayedIsSaving, setDelayedIsSaving] = React.useState(isSaving);

    React.useEffect(() => {
      const previouslySaving = wasSaving.current;
      wasSaving.current = isSaving;

      if (isSaving) {
        setDelayedIsSaving(true);
        return;
      }

      const saveJustCompleted =
        previouslySaving && !isSaving && !saveInProgressRef.current;
      if (!saveJustCompleted && saveTick === lastTick.current) return;
      if (saveTick !== undefined && saveTick === lastTick.current) {
        setDelayedIsSaving(false);
        return;
      }

      if (saveTick !== undefined) {
        lastTick.current = saveTick;
      }

      if (!succeeded) {
        setDelayedIsSaving(false);
        return;
      }

      saveInProgressRef.current = true;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        setDelayedIsSaving(false);
        setJustSaved(true);
        setSaveCooldown(true);

        timeoutRef.current = window.setTimeout(() => {
          setJustSaved(false);
          setSaveCooldown(false);
          saveInProgressRef.current = false;
          timeoutRef.current = null;
        }, 600);
      }, 800);
    }, [isSaving, succeeded, saveTick]);

    React.useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    const isPrimary = variant === "primary";
    const isNeutral = variant === "neutral";
    const isLink = variant === "link";

    const baseClass = isLink
      ? "inline-flex items-center cursor-pointer text-ui font-semibold text-text-muted underline-offset-4 transition-colors hover:text-text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
      : cn(
          actionButtonBase,
          isPrimary && actionButtonPrimary,
          isNeutral && actionButtonNeutral,
        );

    const label = isSaving ? savingLabel : justSaved ? savedLabel : children;
    const displayLabel = delayedIsSaving ? savingLabel : label;
    const stateKey = isSaving ? "saving" : justSaved ? "saved" : "idle";

    return (
      <button
        ref={ref}
        type="button"
        className={cn(baseClass, className)}
        disabled={disabled || delayedIsSaving || saveCooldown}
        onClick={onClick}
        aria-live="polite"
        {...rest}
      >
        <span
          key={stateKey}
          className={cn(
            "inline-block",
            justSaved
              ? "animate-fade-in font-bold tracking-tight"
              : "animate-fade-in",
          )}
        >
          {displayLabel}
        </span>
      </button>
    );
  },
);
SaveButton.displayName = "SaveButton";
