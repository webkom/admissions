import React from "react";

export type ScheduleGridToggleMode = "add" | "remove";

const TOUCH_PAN_THRESHOLD_PX = 8;

interface UseScheduleGridDragToggleOptions<Target> {
  getMode: (target: Target) => ScheduleGridToggleMode;
  apply: (target: Target, mode: ScheduleGridToggleMode) => void;
}

/**
 * Keeps block and fine-slot grids consistent: the first cell determines
 * whether a drag adds or removes, then every crossed cell follows that mode.
 */
export const useScheduleGridDragToggle = <Target>({
  getMode,
  apply,
}: UseScheduleGridDragToggleOptions<Target>) => {
  const isDraggingRef = React.useRef(false);
  const modeRef = React.useRef<ScheduleGridToggleMode>("add");
  const getModeRef = React.useRef(getMode);
  const applyRef = React.useRef(apply);
  const pendingTouchRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    target: Target;
  } | null>(null);

  React.useEffect(() => {
    getModeRef.current = getMode;
    applyRef.current = apply;
  }, [apply, getMode]);

  const finishDrag = React.useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  React.useEffect(() => {
    const movedPastTouchThreshold = (event: PointerEvent) => {
      const pending = pendingTouchRef.current;
      if (!pending || pending.pointerId !== event.pointerId) return false;
      return (
        Math.hypot(
          event.clientX - pending.startX,
          event.clientY - pending.startY,
        ) > TOUCH_PAN_THRESHOLD_PX
      );
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (movedPastTouchThreshold(event)) pendingTouchRef.current = null;
    };
    const handlePointerUp = (event: PointerEvent) => {
      const pending = pendingTouchRef.current;
      if (
        pending &&
        pending.pointerId === event.pointerId &&
        !movedPastTouchThreshold(event)
      ) {
        const mode = getModeRef.current(pending.target);
        applyRef.current(pending.target, mode);
      }
      pendingTouchRef.current = null;
      finishDrag();
    };
    const handlePointerCancel = () => {
      pendingTouchRef.current = null;
      finishDrag();
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [finishDrag]);

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>, target: Target) => {
      if (event.button > 0 || event.ctrlKey || event.isPrimary === false)
        return;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (event.pointerType === "touch") {
        isDraggingRef.current = false;
        pendingTouchRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          target,
        };
        return;
      }

      pendingTouchRef.current = null;
      const mode = getModeRef.current(target);
      modeRef.current = mode;
      isDraggingRef.current = true;
      applyRef.current(target, mode);
    },
    [],
  );

  const onPointerEnter = React.useCallback((target: Target) => {
    if (isDraggingRef.current) applyRef.current(target, modeRef.current);
  }, []);

  return { onPointerDown, onPointerEnter };
};

export const isScheduleGridToggleKey = (key: string) =>
  key === "Enter" || key === " ";
