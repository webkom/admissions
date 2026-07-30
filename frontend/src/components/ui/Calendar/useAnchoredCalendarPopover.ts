import React from "react";

export interface CalendarPopoverLayoutContext {
  isCompact: boolean;
  isShort: boolean;
  triggerRect: DOMRect | null;
  viewportHeight: number;
  viewportWidth: number;
}

interface UseAnchoredCalendarPopoverOptions<
  CloseArguments extends unknown[] = [],
> {
  isOpen: boolean;
  triggerRef: React.RefObject<HTMLButtonElement>;
  compactViewportQuery: string;
  isShortViewport?: () => boolean;
  calculateLayout: (
    context: CalendarPopoverLayoutContext,
  ) => React.CSSProperties;
  initialFocus: (
    dialog: HTMLDivElement,
    context: Pick<CalendarPopoverLayoutContext, "isCompact" | "isShort">,
  ) => HTMLElement | null;
  onClose: (...args: CloseArguments) => void;
}

const useAnchoredCalendarPopover = <CloseArguments extends unknown[] = []>({
  isOpen,
  triggerRef,
  compactViewportQuery,
  isShortViewport = () => false,
  calculateLayout,
  initialFocus,
  onClose,
}: UseAnchoredCalendarPopoverOptions<CloseArguments>) => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = React.useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(compactViewportQuery).matches,
  );
  const [isShort, setIsShort] = React.useState(
    () => typeof window !== "undefined" && isShortViewport(),
  );
  const [dialogStyle, setDialogStyle] = React.useState<React.CSSProperties>({});

  const updateLayout = React.useCallback(() => {
    const compact = window.matchMedia(compactViewportQuery).matches;
    const short = isShortViewport();
    const triggerRect = triggerRef.current?.getBoundingClientRect() ?? null;
    const context: CalendarPopoverLayoutContext = {
      isCompact: compact,
      isShort: short,
      triggerRect,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
    setIsCompact(compact);
    setIsShort(short);
    setDialogStyle(calculateLayout(context));
    return context;
  }, [calculateLayout, compactViewportQuery, isShortViewport, triggerRef]);

  React.useLayoutEffect(() => {
    if (!isOpen) return undefined;
    const context = updateLayout();
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (dialog) {
        initialFocus(dialog, context)?.focus();
      }
    });
    const handleViewportChange = () => updateLayout();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [initialFocus, isOpen, updateLayout]);

  const closeAndRestoreFocus = React.useCallback(
    (...args: CloseArguments) => {
      const dialog = dialogRef.current;
      const activeBeforeClose = document.activeElement;
      const shouldRestoreFocus =
        activeBeforeClose === null ||
        activeBeforeClose === document.body ||
        Boolean(activeBeforeClose && dialog?.contains(activeBeforeClose));

      onClose(...args);
      requestAnimationFrame(() => {
        const trigger = triggerRef.current;
        const activeAfterClose = document.activeElement;
        const focusMovedElsewhere = Boolean(
          activeAfterClose &&
            activeAfterClose !== document.body &&
            activeAfterClose !== trigger,
        );

        if (
          shouldRestoreFocus &&
          !focusMovedElsewhere &&
          trigger?.isConnected
        ) {
          trigger.focus();
        }
      });
    },
    [onClose, triggerRef],
  );

  return {
    closeAndRestoreFocus,
    dialogRef,
    dialogStyle,
    isCompact,
    isShort,
  };
};

export default useAnchoredCalendarPopover;
