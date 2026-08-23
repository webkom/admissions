import { useEffect, useRef, useState } from "react";

const ACTIVITY_EVENTS = [
  "mousemove",
  "keydown",
  "pointerdown",
  "scroll",
] as const;

/**
 * Whether the user has gone `idleAfterMs` without any mouse/keyboard/scroll
 * activity - or without the tab being visible, since a page that's simply
 * backgrounded shouldn't count as "the user is here but not moving".
 *
 * Used to back off polling intervals that would otherwise run at full speed
 * for as long as a tab is open, regardless of whether anyone is actually
 * watching it.
 */
export const useIsWindowIdle = (idleAfterMs: number): boolean => {
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const reset = () => {
      clearTimer();
      setIsIdle(false);
      timerRef.current = window.setTimeout(() => setIsIdle(true), idleAfterMs);
    };

    const handleActivity = () => reset();
    const handleVisibility = () => {
      if (!document.hidden) reset();
    };

    reset();
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, handleActivity, { passive: true }),
    );
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearTimer();
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, handleActivity),
      );
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [idleAfterMs]);

  return isIdle;
};
