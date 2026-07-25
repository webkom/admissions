import React, { useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScheduleSlotSegments } from "./ScheduleGridFrame";
import {
  buildStandardBlockPreviewLayout,
  formatClockMinute,
  type StandardBlockPreviewInput,
  type StandardBlockPreviewLayout,
} from "./standardBlockPreviewModel";
import {
  EXPAND_CONTRACT_MOTION,
  animateContractedElement,
  animateExpandedElementOnNextFrame,
  readExpandContractState,
  setExpandedElement,
} from "./expandContractMotion";

type PreviewDensity = "wide" | "compact" | "narrow";

const PREVIEW_TRANSITION_SECONDS = EXPAND_CONTRACT_MOTION.durationSeconds;
const TIMESTAMP_PHASE_SECONDS = PREVIEW_TRANSITION_SECONDS / 2;
const REDUCED_MOTION_QUERY = EXPAND_CONTRACT_MOTION.reducedMotionQuery;

const blockHeightForDuration = (minutes: number) =>
  Math.max(66, Math.min(124, 48 + minutes * 0.4));

const pauseHeightForDuration = (minutes: number) =>
  minutes <= 0 ? 0 : Math.max(30, Math.min(58, 20 + minutes * 0.4));

const PreviewTimeLabel: React.FC<{
  startMinute: number;
  endMinute?: number;
  children?: React.ReactNode;
}> = ({ startMinute, endMinute, children }) => (
  <div className="flex min-w-0 flex-col items-end justify-center pr-3 text-right">
    <span
      data-preview-time
      className="text-label font-semibold tabular-nums text-text-subtle"
    >
      {formatClockMinute(startMinute)}
    </span>
    {endMinute !== undefined && (
      <span
        data-preview-time
        className="text-nano font-medium leading-none tabular-nums text-text-disabled"
      >
        til {formatClockMinute(endMinute)}
      </span>
    )}
    {children}
  </div>
);

const InterviewBlockShell: React.FC<{
  interviews: StandardBlockPreviewLayout["interviews"];
  duration: number;
  startMinute: number;
  endMinute: number;
  density: PreviewDensity;
}> = ({ interviews, duration, startMinute, endMinute, density }) => (
  <div
    data-cy="interview-block-shell"
    data-layout-id="interview-block-shell"
    data-motion="expand-contract"
    className="grid min-w-0 grid-cols-[4.75rem_minmax(0,1fr)]"
    style={{ height: blockHeightForDuration(duration) }}
    aria-hidden="true"
  >
    <PreviewTimeLabel startMinute={startMinute} endMinute={endMinute} />
    <div className="flex min-w-0 flex-col justify-center gap-3 overflow-hidden rounded-md border border-brand-border bg-surface-base px-3 shadow-sm">
      <ScheduleSlotSegments
        fills={interviews.map(() => 1)}
        className="h-schedule-progress"
      />
      {density === "narrow" && interviews.length > 6 ? (
        <span className="text-center text-detail font-bold text-text-primary">
          {interviews.length} intervjutider
        </span>
      ) : (
        <div
          className="grid min-w-0 gap-1"
          style={{
            gridTemplateColumns: `repeat(${interviews.length}, minmax(0, 1fr))`,
          }}
        >
          {interviews.map((interview) => (
            <div
              key={interview.id}
              data-cy="interview-slot"
              data-layout-id={interview.id}
              className="min-w-0 text-center"
              title={`Intervju ${interview.number}: ${formatClockMinute(
                interview.startMinute,
              )}–${formatClockMinute(interview.endMinute)}`}
            >
              <span className="block max-w-full truncate text-detail font-bold text-text-primary">
                {density === "narrow"
                  ? interview.number
                  : `Intervju ${interview.number}`}
              </span>
              {density === "wide" && (
                <span
                  data-preview-time
                  className="mt-0.5 block max-w-full truncate text-tiny font-medium tabular-nums text-text-muted"
                >
                  {formatClockMinute(interview.startMinute)}–
                  {formatClockMinute(interview.endMinute)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

const SchedulePause: React.FC<{
  density: PreviewDensity;
  visualPauseMinutes: number;
  exiting: boolean;
}> = ({ density, visualPauseMinutes, exiting }) => (
  <div
    data-cy="schedule-pause"
    data-layout-id="pause"
    data-motion="expand-contract-down"
    data-exiting={exiting || undefined}
    className="grid min-w-0 origin-top grid-cols-[4.75rem_minmax(0,1fr)] overflow-hidden"
    style={{ height: pauseHeightForDuration(visualPauseMinutes) }}
    aria-hidden="true"
  >
    <div aria-hidden="true" />
    <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-md border border-dashed border-border-muted bg-surface-muted px-3 text-text-muted">
      <span className="h-px min-w-3 flex-1 border-t border-dashed border-border-muted" />
      <span className="flex-none whitespace-nowrap text-detail font-bold">
        Pause{density === "narrow" ? "" : `, ${visualPauseMinutes} min`}
      </span>
      <span className="h-px min-w-3 flex-1 border-t border-dashed border-border-muted" />
    </div>
  </div>
);

const ScheduleContinuation: React.FC<{
  nextBlockStartMinute: number;
}> = ({ nextBlockStartMinute }) => (
  <div
    data-cy="schedule-continuation"
    className="mt-2 grid min-w-0 grid-cols-[4.75rem_minmax(0,1fr)]"
    aria-hidden="true"
  >
    <PreviewTimeLabel startMinute={nextBlockStartMinute} />
    <div className="flex min-w-0 items-center gap-2 py-2 text-tiny font-semibold text-text-subtle">
      <span className="h-px flex-1 border-t border-dashed border-border-muted" />
      <span>… neste blokk</span>
      <span className="h-px flex-1 border-t border-dashed border-border-muted" />
    </div>
  </div>
);

type StandardBlockPreviewProps = StandardBlockPreviewInput;

const StandardBlockPreview: React.FC<StandardBlockPreviewProps> = (input) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const layout = React.useMemo(
    () => buildStandardBlockPreviewLayout(input),
    [
      input.interviewCount,
      input.interviewDuration,
      input.pauseMinutes,
      input.startMinute,
    ],
  );
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(REDUCED_MOTION_QUERY).matches,
  );
  const [visualPauseMinutes, setVisualPauseMinutes] = useState(
    layout.pauseMinutes,
  );
  const [visualBlockDuration, setVisualBlockDuration] = useState(
    layout.blockDuration,
  );
  const [visualBlockEndMinute, setVisualBlockEndMinute] = useState(
    layout.blockEndMinute,
  );
  const [visualNextBlockStartMinute, setVisualNextBlockStartMinute] = useState(
    layout.nextBlockStartMinute,
  );
  const visualPauseRef = useRef(layout.pauseMinutes);
  const requestedPauseRef = useRef(layout.pauseMinutes);
  const requestedBlockDurationRef = useRef(layout.blockDuration);
  const visualBlockEndRef = useRef(layout.blockEndMinute);
  const visualNextBlockStartRef = useRef(layout.nextBlockStartMinute);
  const requestedBlockEndRef = useRef(layout.blockEndMinute);
  const requestedNextBlockStartRef = useRef(layout.nextBlockStartMinute);
  const animationRef = useRef<gsap.core.Animation | null>(null);
  const blockAnimationRef = useRef<gsap.core.Animation | null>(null);
  const timestampAnimationRef = useRef<gsap.core.Animation | null>(null);
  const mountedRef = useRef(false);
  const blockMountedRef = useRef(false);
  const timestampMountedRef = useRef(false);
  const descriptionId = React.useId();

  const density = React.useMemo<PreviewDensity>(() => {
    if (previewWidth === null) return "wide";
    return previewWidth >= 420
      ? "wide"
      : previewWidth >= 320
        ? "compact"
        : "narrow";
  }, [previewWidth]);

  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (!preview || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      setPreviewWidth((currentWidth) =>
        currentWidth !== null &&
        Math.abs(currentWidth - entry.contentRect.width) < 0.5
          ? currentWidth
          : entry.contentRect.width,
      );
    });
    observer.observe(preview);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (!preview) return undefined;

    const requestedPauseMinutes = layout.pauseMinutes;
    requestedPauseRef.current = requestedPauseMinutes;
    animationRef.current?.kill();
    animationRef.current = null;
    const currentPause = preview.querySelector<HTMLElement>(
      '[data-cy="schedule-pause"]',
    );
    const currentPauseState = readExpandContractState(currentPause);
    if (currentPause) gsap.killTweensOf(currentPause);

    if (!mountedRef.current || prefersReducedMotion) {
      mountedRef.current = true;
      visualPauseRef.current = requestedPauseMinutes;
      setVisualPauseMinutes(requestedPauseMinutes);
      const pause = preview.querySelector<HTMLElement>(
        '[data-cy="schedule-pause"]',
      );
      if (pause && requestedPauseMinutes > 0) {
        setExpandedElement(
          pause,
          pauseHeightForDuration(requestedPauseMinutes),
        );
      }
      return undefined;
    }

    if (requestedPauseMinutes > 0) {
      visualPauseRef.current = requestedPauseMinutes;
      setVisualPauseMinutes(requestedPauseMinutes);
      return animateExpandedElementOnNextFrame({
        resolveElement: () => {
          const currentPreview = previewRef.current;
          if (
            !currentPreview ||
            requestedPauseRef.current !== requestedPauseMinutes
          )
            return null;
          return currentPreview.querySelector<HTMLElement>(
            '[data-cy="schedule-pause"]',
          );
        },
        from: currentPauseState,
        height: pauseHeightForDuration(requestedPauseMinutes),
        onStart: (animation) => {
          animationRef.current = animation;
        },
      });
    } else if (visualPauseRef.current > 0) {
      const pause = currentPause;
      if (pause) {
        animationRef.current = animateContractedElement({
          element: pause,
          from: currentPauseState,
          onComplete: () => {
            visualPauseRef.current = 0;
            setVisualPauseMinutes(0);
          },
        });
      } else {
        visualPauseRef.current = 0;
        setVisualPauseMinutes(0);
      }
    }
    return undefined;
  }, [layout.pauseMinutes, prefersReducedMotion]);

  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (!preview) return undefined;

    const shell = preview.querySelector<HTMLElement>(
      '[data-cy="interview-block-shell"]',
    );
    if (!shell) return undefined;

    const requestedDuration = layout.blockDuration;
    requestedBlockDurationRef.current = requestedDuration;
    const currentHeight = Number(gsap.getProperty(shell, "height"));
    const requestedHeight = blockHeightForDuration(requestedDuration);

    blockAnimationRef.current?.kill();
    blockAnimationRef.current = null;
    gsap.killTweensOf(shell);

    if (!blockMountedRef.current || prefersReducedMotion) {
      blockMountedRef.current = true;
      setVisualBlockDuration(requestedDuration);
      gsap.set(shell, { height: requestedHeight });
      return undefined;
    }

    if (Math.abs(currentHeight - requestedHeight) < 0.01) {
      setVisualBlockDuration(requestedDuration);
      return undefined;
    }

    blockAnimationRef.current = gsap.fromTo(
      shell,
      { height: currentHeight },
      {
        height: requestedHeight,
        duration: PREVIEW_TRANSITION_SECONDS,
        ease: "power2.inOut",
        overwrite: true,
        onComplete: () => {
          if (requestedBlockDurationRef.current !== requestedDuration) return;
          setVisualBlockDuration(requestedDuration);
        },
      },
    );

    return undefined;
  }, [layout.blockDuration, prefersReducedMotion]);

  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (!preview) return undefined;

    const blockTimestamp = preview.querySelector<HTMLElement>(
      '[data-cy="block-time-range"]',
    );
    const nextTimestamp = preview.querySelector<HTMLElement>(
      '[data-cy="next-block-time"]',
    );
    if (!blockTimestamp || !nextTimestamp) return undefined;

    const requestedBlockEndMinute = layout.blockEndMinute;
    const requestedNextBlockStartMinute = layout.nextBlockStartMinute;
    requestedBlockEndRef.current = requestedBlockEndMinute;
    requestedNextBlockStartRef.current = requestedNextBlockStartMinute;
    const blockEndChanged =
      visualBlockEndRef.current !== requestedBlockEndMinute;
    const nextBlockStartChanged =
      visualNextBlockStartRef.current !== requestedNextBlockStartMinute;
    const pauseTimestamp = preview.querySelector<HTMLElement>(
      '[data-cy="pause-time-range"]',
    );
    const visibleTimestamps = Array.from(
      preview.querySelectorAll<HTMLElement>("[data-preview-time]"),
    );
    const targets = [
      ...(blockEndChanged ? [blockTimestamp] : []),
      ...(nextBlockStartChanged ? [nextTimestamp] : []),
      ...(pauseTimestamp && (blockEndChanged || nextBlockStartChanged)
        ? [pauseTimestamp]
        : []),
      ...(blockEndChanged || nextBlockStartChanged ? visibleTimestamps : []),
    ];

    timestampAnimationRef.current?.kill();
    timestampAnimationRef.current = null;
    gsap.killTweensOf(
      [
        blockTimestamp,
        nextTimestamp,
        pauseTimestamp,
        ...visibleTimestamps,
      ].filter(Boolean),
    );

    if (!timestampMountedRef.current || prefersReducedMotion) {
      timestampMountedRef.current = true;
      visualBlockEndRef.current = requestedBlockEndMinute;
      visualNextBlockStartRef.current = requestedNextBlockStartMinute;
      setVisualBlockEndMinute(requestedBlockEndMinute);
      setVisualNextBlockStartMinute(requestedNextBlockStartMinute);
      gsap.set(
        [
          blockTimestamp,
          nextTimestamp,
          pauseTimestamp,
          ...visibleTimestamps,
        ].filter(Boolean),
        {
          autoAlpha: 1,
          clearProps: "opacity,visibility",
        },
      );
      return undefined;
    }

    if (targets.length === 0) {
      gsap.set(
        [blockTimestamp, nextTimestamp, ...visibleTimestamps].filter(Boolean),
        {
          autoAlpha: 1,
          clearProps: "opacity,visibility",
        },
      );
      return undefined;
    }

    timestampAnimationRef.current = gsap
      .timeline()
      .to(targets, {
        autoAlpha: 0,
        duration: TIMESTAMP_PHASE_SECONDS,
        ease: "power1.in",
      })
      .call(() => {
        if (
          requestedBlockEndRef.current !== requestedBlockEndMinute ||
          requestedNextBlockStartRef.current !== requestedNextBlockStartMinute
        )
          return;
        visualBlockEndRef.current = requestedBlockEndMinute;
        visualNextBlockStartRef.current = requestedNextBlockStartMinute;
        setVisualBlockEndMinute(requestedBlockEndMinute);
        setVisualNextBlockStartMinute(requestedNextBlockStartMinute);
      })
      .to(targets, {
        autoAlpha: 1,
        duration: TIMESTAMP_PHASE_SECONDS,
        ease: "power1.out",
        clearProps: "opacity,visibility",
      });

    return undefined;
  }, [
    layout.blockEndMinute,
    layout.nextBlockStartMinute,
    prefersReducedMotion,
  ]);

  useLayoutEffect(
    () => () => {
      animationRef.current?.kill();
      blockAnimationRef.current?.kill();
      timestampAnimationRef.current?.kill();
      if (!previewRef.current) return;
      const pause = previewRef.current.querySelector<HTMLElement>(
        '[data-cy="schedule-pause"]',
      );
      if (pause) gsap.killTweensOf(pause);
      const shell = previewRef.current.querySelector<HTMLElement>(
        '[data-cy="interview-block-shell"]',
      );
      if (shell) gsap.killTweensOf(shell);
      const timestamps = previewRef.current.querySelectorAll<HTMLElement>(
        '[data-cy="block-time-range"], [data-cy="next-block-time"], [data-cy="pause-time-range"], [data-preview-time]',
      );
      gsap.killTweensOf(timestamps);
    },
    [],
  );

  return (
    <div
      ref={previewRef}
      data-cy="standard-block-preview"
      data-density={density}
    >
      <figure className="m-0 min-w-0" aria-describedby={descriptionId}>
        <p id={descriptionId} className="sr-only">
          {layout.accessibleDescription}
        </p>

        <div className="min-w-0" aria-hidden="true">
          <span data-cy="block-time-range" data-time-value className="sr-only">
            {formatClockMinute(layout.startMinute)}–
            {formatClockMinute(visualBlockEndMinute)}
          </span>
          <div
            data-cy="standard-block-timed-layout"
            className="flex min-w-0 flex-col gap-1.5"
          >
            <InterviewBlockShell
              interviews={layout.interviews}
              duration={visualBlockDuration}
              startMinute={layout.startMinute}
              endMinute={visualBlockEndMinute}
              density={density}
            />
          </div>
          {visualPauseMinutes > 0 && (
            <SchedulePause
              density={density}
              visualPauseMinutes={visualPauseMinutes}
              exiting={layout.pauseMinutes === 0}
            />
          )}
          <span data-cy="next-block-time" data-time-value className="sr-only">
            {formatClockMinute(visualNextBlockStartMinute)}
          </span>
          <ScheduleContinuation
            nextBlockStartMinute={visualNextBlockStartMinute}
          />
        </div>
      </figure>
    </div>
  );
};

export default StandardBlockPreview;
