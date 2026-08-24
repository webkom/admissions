import React, { useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
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

const pauseHeightForDuration = (minutes: number) =>
  minutes <= 0 ? 0 : Math.max(30, Math.min(58, 20 + minutes * 0.4));

const InterviewBlockShell: React.FC<{
  interviews: StandardBlockPreviewLayout["interviews"];
  density: PreviewDensity;
  children?: React.ReactNode;
}> = ({ interviews, density, children }) => (
  <div
    data-cy="interview-block-shell"
    data-layout-id="interview-block-shell"
    data-motion="expand-contract"
    className="min-w-0 rounded-md border border-border-soft bg-surface-subtle px-4 py-3.5"
    aria-hidden="true"
  >
    <span className="mb-2.5 block text-label font-semibold uppercase tracking-label text-text-muted">
      Én blokk blir slik
    </span>
    {density === "narrow" && interviews.length > 6 ? (
      <span className="block text-center text-detail font-bold text-text-primary">
        {interviews.length} intervjutider
      </span>
    ) : (
      <div
        className="grid min-w-0 gap-2"
        style={{
          gridTemplateColumns: `repeat(${interviews.length}, minmax(0, 1fr))`,
        }}
      >
        {interviews.map((interview) => (
          <div
            key={interview.id}
            data-cy="interview-slot"
            data-layout-id={interview.id}
            className="min-w-0 rounded-md border border-brand-border bg-brand-soft px-3 py-2.5"
            title={`Intervju ${interview.number}: ${formatClockMinute(
              interview.startMinute,
            )}–${formatClockMinute(interview.endMinute)}`}
          >
            <span className="block max-w-full truncate text-detail font-semibold text-text-primary">
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
    {children}
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
    className="mt-2.5 grid min-w-0 origin-top overflow-hidden"
    style={{ height: pauseHeightForDuration(visualPauseMinutes) }}
    aria-hidden="true"
  >
    <div className="flex min-w-0 items-center gap-2 overflow-hidden px-1 text-text-subtle">
      <span className="h-px min-w-3 flex-1 border-t border-dashed border-border-soft" />
      <span className="flex-none whitespace-nowrap text-tiny font-medium">
        Pause{density === "narrow" ? "" : `, ${visualPauseMinutes} min`}
      </span>
      <span className="h-px min-w-3 flex-1 border-t border-dashed border-border-soft" />
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
  const [visualBlockEndMinute, setVisualBlockEndMinute] = useState(
    layout.blockEndMinute,
  );
  const [visualNextBlockStartMinute, setVisualNextBlockStartMinute] = useState(
    layout.nextBlockStartMinute,
  );
  const visualPauseRef = useRef(layout.pauseMinutes);
  const requestedPauseRef = useRef(layout.pauseMinutes);
  const visualBlockEndRef = useRef(layout.blockEndMinute);
  const visualNextBlockStartRef = useRef(layout.nextBlockStartMinute);
  const requestedBlockEndRef = useRef(layout.blockEndMinute);
  const requestedNextBlockStartRef = useRef(layout.nextBlockStartMinute);
  const animationRef = useRef<gsap.core.Animation | null>(null);
  const timestampAnimationRef = useRef<gsap.core.Animation | null>(null);
  const mountedRef = useRef(false);
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
              density={density}
            >
              {visualPauseMinutes > 0 && (
                <SchedulePause
                  density={density}
                  visualPauseMinutes={visualPauseMinutes}
                  exiting={layout.pauseMinutes === 0}
                />
              )}
            </InterviewBlockShell>
          </div>
          <span data-cy="next-block-time" data-time-value className="sr-only">
            {formatClockMinute(visualNextBlockStartMinute)}
          </span>
        </div>
      </figure>
    </div>
  );
};

export default StandardBlockPreview;
