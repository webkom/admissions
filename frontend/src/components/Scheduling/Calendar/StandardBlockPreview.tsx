import React, { useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { ScheduleSlotSegments } from "./ScheduleGridFrame";
import {
  buildStandardBlockPreviewLayout,
  formatClockMinute,
  type StandardBlockPreviewInput,
  type StandardBlockPreviewLayout,
} from "./standardBlockPreviewModel";

type PreviewDensity = "wide" | "compact" | "narrow";

gsap.registerPlugin(Flip);

const InterviewBlockShell: React.FC<{
  children: React.ReactNode;
  slotCount: number;
  duration: number;
}> = ({ children, slotCount, duration }) => (
  <div
    data-cy="interview-block-shell"
    data-layout-id="interview-block-shell"
    data-flip="standard-block"
    className="min-w-0 overflow-hidden rounded-md border border-brand-activeBorder bg-brand-tint text-brand ring-1 ring-inset ring-brand-border"
    style={{ flexBasis: 0, flexGrow: duration }}
    aria-hidden="true"
  >
    <ScheduleSlotSegments
      fills={Array.from({ length: slotCount }, () => 1)}
      className="px-2 pt-2"
    />
    <div className="mt-1 flex min-w-0">{children}</div>
  </div>
);

const InterviewSlot: React.FC<{
  density: PreviewDensity;
  interview: StandardBlockPreviewLayout["interviews"][number];
  duration: number;
}> = ({ density, interview, duration }) => (
  <div
    data-cy="interview-slot"
    data-layout-id={interview.id}
    className={`flex h-14 min-w-0 flex-1 origin-right flex-col items-center justify-center overflow-hidden border-r border-brand-activeBorder text-center last:border-r-0 ${
      density === "narrow" ? "px-0" : "px-1"
    }`}
    title={`Intervju ${interview.number}: ${formatClockMinute(
      interview.startMinute,
    )}–${formatClockMinute(interview.endMinute)}`}
    aria-hidden="true"
  >
    <span
      className={`block max-w-full font-bold text-text-primary ${
        density === "narrow" ? "text-label" : "truncate text-detail"
      }`}
    >
      {density === "wide"
        ? `Intervju ${interview.number}`
        : density === "compact"
          ? `I${interview.number}`
          : interview.number}
    </span>
    {density === "wide" && (
      <span className="mt-0.5 block max-w-full truncate text-tiny font-medium tabular-nums text-text-muted">
        {formatClockMinute(interview.startMinute)}–
        {formatClockMinute(interview.endMinute)}
      </span>
    )}
    {density === "compact" && (
      <span className="mt-0.5 block text-tiny font-medium tabular-nums text-text-muted">
        {duration} min
      </span>
    )}
  </div>
);

const SchedulePause: React.FC<{
  density: PreviewDensity;
  layout: StandardBlockPreviewLayout;
  visualPauseMinutes: number;
  exiting: boolean;
}> = ({ density, layout, visualPauseMinutes, exiting }) => (
  <div
    data-cy="schedule-pause"
    data-layout-id="pause"
    data-flip="standard-block"
    data-exiting={exiting || undefined}
    className={`flex min-w-0 origin-left flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-border-muted bg-surface-muted text-center text-text-muted ${
      density === "narrow" ? "px-0" : "px-2"
    }`}
    style={{ flexBasis: 0, flexGrow: visualPauseMinutes }}
    aria-hidden="true"
  >
    {density !== "narrow" && (
      <>
        <span className="block max-w-full truncate text-detail font-bold">
          Pause
        </span>
        {density === "wide" && (
          <span className="mt-0.5 block max-w-full truncate text-tiny font-medium tabular-nums">
            {formatClockMinute(layout.blockEndMinute)}–
            {formatClockMinute(layout.nextBlockStartMinute)}
          </span>
        )}
        {density === "compact" && (
          <span className="mt-0.5 block text-tiny font-medium tabular-nums">
            {visualPauseMinutes} min
          </span>
        )}
      </>
    )}
  </div>
);

const ScheduleContinuation = () => (
  <div
    data-cy="schedule-continuation"
    className="flex w-10 flex-none items-center justify-center border-l border-dashed border-border-muted text-lg font-semibold text-text-subtle"
    aria-hidden="true"
  >
    …
  </div>
);

export const StandardBlockPreview: React.FC<StandardBlockPreviewInput> = (
  input,
) => {
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
  const [visualPauseMinutes, setVisualPauseMinutes] = useState(
    layout.pauseMinutes,
  );
  const visualPauseRef = useRef(layout.pauseMinutes);
  const requestedPauseRef = useRef(layout.pauseMinutes);
  const flipStateRef = useRef<ReturnType<typeof Flip.getState> | null>(null);
  const animationRef = useRef<gsap.core.Animation | null>(null);
  const mountedRef = useRef(false);
  const descriptionId = React.useId();
  const headingId = React.useId();

  const density = React.useMemo<PreviewDensity>(() => {
    if (previewWidth === null) return "wide";
    const continuationWidth = 40;
    const availableWidth = Math.max(0, previewWidth - continuationWidth - 8);
    const timedDuration = Math.max(1, layout.totalPatternDuration);
    const interviewBlockWidth =
      availableWidth * (layout.blockDuration / timedDuration);
    const slotWidth = interviewBlockWidth / Math.max(1, layout.interviewCount);
    return slotWidth >= 92 ? "wide" : slotWidth >= 54 ? "compact" : "narrow";
  }, [layout, previewWidth]);

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
    const preview = previewRef.current;
    if (!preview) return undefined;

    const requestedPauseMinutes = layout.pauseMinutes;
    requestedPauseRef.current = requestedPauseMinutes;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const targets = preview.querySelectorAll<HTMLElement>(
      '[data-flip="standard-block"]',
    );
    const captureFlipState = () => {
      const currentPreview = previewRef.current;
      if (!currentPreview) return;
      flipStateRef.current = Flip.getState(
        currentPreview.querySelectorAll<HTMLElement>(
          '[data-flip="standard-block"]',
        ),
      );
    };

    animationRef.current?.kill();
    animationRef.current = null;
    Flip.killFlipsOf(targets);
    gsap.killTweensOf(targets);

    if (!mountedRef.current || reduceMotion) {
      mountedRef.current = true;
      visualPauseRef.current = requestedPauseMinutes;
      setVisualPauseMinutes(requestedPauseMinutes);
      gsap.set(targets, {
        clearProps: "transform,opacity,visibility",
      });
      const pause = preview.querySelector<HTMLElement>(
        '[data-cy="schedule-pause"]',
      );
      if (pause && requestedPauseMinutes > 0) {
        gsap.set(pause, { flexGrow: requestedPauseMinutes });
      }
      return captureFlipState;
    }

    if (requestedPauseMinutes > 0) {
      const entering = visualPauseRef.current === 0;
      visualPauseRef.current = requestedPauseMinutes;
      setVisualPauseMinutes(requestedPauseMinutes);
      requestAnimationFrame(() => {
        const currentPreview = previewRef.current;
        if (
          !currentPreview ||
          requestedPauseRef.current !== requestedPauseMinutes
        )
          return;
        const pause = currentPreview.querySelector<HTMLElement>(
          '[data-cy="schedule-pause"]',
        );
        if (flipStateRef.current) {
          Flip.from(flipStateRef.current, {
            duration: 0.26,
            ease: "power2.out",
            absolute: false,
            simple: true,
          });
        }
        if (entering && pause) {
          animationRef.current = gsap.fromTo(
            pause,
            { autoAlpha: 0, flexGrow: 0 },
            {
              autoAlpha: 1,
              flexGrow: requestedPauseMinutes,
              duration: 0.26,
              ease: "power2.out",
              clearProps: "visibility,opacity",
              onComplete: () =>
                gsap.set(pause, {
                  opacity: 1,
                  visibility: "inherit",
                  clearProps: "opacity,visibility",
                }),
            },
          );
        } else if (pause) {
          gsap.set(pause, {
            autoAlpha: 1,
            flexGrow: requestedPauseMinutes,
            clearProps: "opacity,visibility",
          });
        }
      });
    } else if (visualPauseRef.current > 0) {
      const pause = preview.querySelector<HTMLElement>(
        '[data-cy="schedule-pause"]',
      );
      if (flipStateRef.current) {
        Flip.from(flipStateRef.current, {
          duration: 0.26,
          ease: "power2.out",
          absolute: false,
          simple: true,
        });
      }
      if (pause) {
        animationRef.current = gsap.to(pause, {
          autoAlpha: 0,
          flexGrow: 0,
          duration: 0.26,
          ease: "power2.inOut",
          overwrite: true,
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

    return captureFlipState;
  }, [layout.pauseMinutes]);

  useLayoutEffect(
    () => () => {
      animationRef.current?.kill();
      if (!previewRef.current) return;
      const targets = previewRef.current.querySelectorAll<HTMLElement>(
        '[data-flip="standard-block"]',
      );
      Flip.killFlipsOf(targets);
      gsap.killTweensOf(targets);
    },
    [],
  );

  return (
    <div
      ref={previewRef}
      data-cy="standard-block-preview"
      data-density={density}
    >
      <figure
        className="m-0 min-w-0"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
      >
        <figcaption>
          <h4
            id={headingId}
            className="m-0 text-ui font-bold text-text-primary"
          >
            Standardblokk
          </h4>
        </figcaption>

        <p id={descriptionId} className="sr-only">
          {layout.accessibleDescription}
        </p>

        <div
          className="mt-4 flex items-end justify-between gap-3 text-tiny font-semibold text-text-muted"
          aria-hidden="true"
        >
          <span
            data-flip="standard-block"
            className="min-w-0 truncate whitespace-nowrap"
          >
            <span className="text-brand">Én intervjublokk</span>
            <span data-time-value className="ml-1.5 tabular-nums">
              {formatClockMinute(layout.startMinute)}–
              {formatClockMinute(layout.blockEndMinute)}
            </span>
          </span>
          <span
            data-flip="standard-block"
            className="flex-none whitespace-nowrap"
          >
            Neste blokk{" "}
            <span data-time-value className="tabular-nums text-text-primary">
              {formatClockMinute(layout.nextBlockStartMinute)}
            </span>
          </span>
        </div>

        <div className="mt-3 flex min-w-0 gap-1.5" aria-hidden="true">
          <div
            data-cy="standard-block-timed-layout"
            className="flex min-w-0 flex-1 gap-1.5"
          >
            <InterviewBlockShell
              slotCount={layout.interviewCount}
              duration={layout.blockDuration}
            >
              {layout.interviews.map((interview) => (
                <InterviewSlot
                  key={interview.id}
                  density={density}
                  interview={interview}
                  duration={layout.interviewDuration}
                />
              ))}
            </InterviewBlockShell>
            {visualPauseMinutes > 0 && (
              <SchedulePause
                density={density}
                layout={
                  layout.pauseMinutes > 0
                    ? layout
                    : {
                        ...layout,
                        pauseMinutes: visualPauseMinutes,
                        nextBlockStartMinute:
                          layout.blockEndMinute + visualPauseMinutes,
                      }
                }
                visualPauseMinutes={visualPauseMinutes}
                exiting={layout.pauseMinutes === 0}
              />
            )}
          </div>
          <ScheduleContinuation />
        </div>
      </figure>
    </div>
  );
};

export default StandardBlockPreview;
