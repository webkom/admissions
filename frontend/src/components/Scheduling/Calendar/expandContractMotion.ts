import { gsap } from "gsap";

// GSAP's default lag smoothing exists to keep a stalled tween from lurching
// forward once the tab catches up - it caps how much elapsed time a single
// delayed tick may credit toward progress (see gsap-core.js's _tick). That's
// the wrong tradeoff for a CPU-starved CI runner: instead of the tween
// jumping to its end state once a frame is finally available, it creeps
// along at that capped rate, so a nominal 500ms transition can take many
// real seconds under sustained throttling - long enough to blow past even a
// generous command-timeout retry. Disabling it makes a stalled tween finish
// on the next tick it actually gets, matching what these expand/contract
// transitions should look like regardless of how starved the tab is.
gsap.ticker.lagSmoothing(0);

// Cypress can fake Date but not requestAnimationFrame, so a spec that needs
// to inspect a specific instant mid-transition (rather than race a real
// animation frame against however loaded the runner is) has no way to
// force GSAP's rAF-driven ticker to advance on demand. Exposing the ticker
// only when Cypress's own runner is present - window.Cypress is injected
// by Cypress itself, never in a real deployment - gives it exactly that,
// via ticker.tick(), without adding anything reachable by an actual user.
if (typeof window !== "undefined" && "Cypress" in window) {
  (window as unknown as { __gsapTicker: typeof gsap.ticker }).__gsapTicker =
    gsap.ticker;
}

export const EXPAND_CONTRACT_MOTION = {
  durationSeconds: 0.5,
  enterEase: "power2.out",
  exitEase: "power2.inOut",
  transformOrigin: "center top",
  reducedMotionQuery: "(prefers-reduced-motion: reduce)",
  enterClearProps: "opacity,visibility,transform",
  autoHeightEnterClearProps: "height,opacity,visibility,transform",
} as const;

interface ExpandContractState {
  height: number;
  opacity: number;
  scaleY: number;
}

export const readExpandContractState = (
  element: HTMLElement | null,
): ExpandContractState => {
  if (!element) return { height: 0, opacity: 0, scaleY: 0 };

  return {
    height:
      Number(gsap.getProperty(element, "height")) || element.offsetHeight || 0,
    opacity: Number(gsap.getProperty(element, "opacity")),
    scaleY: Number(gsap.getProperty(element, "scaleY")),
  };
};

export const setExpandedElement = (
  element: HTMLElement,
  height: number,
  clearHeight = false,
) => {
  gsap.set(element, {
    autoAlpha: 1,
    height,
    scaleY: 1,
    transformOrigin: EXPAND_CONTRACT_MOTION.transformOrigin,
    clearProps: clearHeight
      ? EXPAND_CONTRACT_MOTION.autoHeightEnterClearProps
      : EXPAND_CONTRACT_MOTION.enterClearProps,
  });
};

const animateExpandedElement = ({
  element,
  from,
  height,
  durationSeconds = EXPAND_CONTRACT_MOTION.durationSeconds,
  clearHeightOnComplete = false,
}: {
  element: HTMLElement;
  from: ExpandContractState;
  height: number;
  durationSeconds?: number;
  clearHeightOnComplete?: boolean;
}) =>
  gsap.fromTo(
    element,
    {
      autoAlpha: from.opacity,
      height: from.height,
      scaleY: from.scaleY,
      transformOrigin: EXPAND_CONTRACT_MOTION.transformOrigin,
    },
    {
      autoAlpha: 1,
      height,
      scaleY: 1,
      transformOrigin: EXPAND_CONTRACT_MOTION.transformOrigin,
      duration: durationSeconds,
      ease: EXPAND_CONTRACT_MOTION.enterEase,
      overwrite: true,
      clearProps: clearHeightOnComplete
        ? EXPAND_CONTRACT_MOTION.autoHeightEnterClearProps
        : EXPAND_CONTRACT_MOTION.enterClearProps,
    },
  );

export const animateExpandedElementOnNextFrame = ({
  resolveElement,
  from,
  height,
  durationSeconds,
  clearHeightOnComplete,
  onStart,
}: {
  resolveElement: () => HTMLElement | null;
  from: ExpandContractState;
  height: number | ((element: HTMLElement) => number);
  durationSeconds?: number;
  clearHeightOnComplete?: boolean;
  onStart: (animation: gsap.core.Tween) => void;
}) => {
  const animationFrame = requestAnimationFrame(() => {
    const element = resolveElement();
    if (!element) return;

    onStart(
      animateExpandedElement({
        element,
        from,
        height: typeof height === "function" ? height(element) : height,
        durationSeconds,
        clearHeightOnComplete,
      }),
    );
  });

  return () => cancelAnimationFrame(animationFrame);
};

export const animateContractedElement = ({
  element,
  from,
  onComplete,
}: {
  element: HTMLElement;
  from: ExpandContractState;
  onComplete?: () => void;
}) =>
  gsap.fromTo(
    element,
    {
      autoAlpha: from.opacity,
      height: from.height,
      scaleY: from.scaleY,
      transformOrigin: EXPAND_CONTRACT_MOTION.transformOrigin,
    },
    {
      autoAlpha: 0,
      height: 0,
      scaleY: 0,
      transformOrigin: EXPAND_CONTRACT_MOTION.transformOrigin,
      duration: EXPAND_CONTRACT_MOTION.durationSeconds,
      ease: EXPAND_CONTRACT_MOTION.exitEase,
      overwrite: true,
      onComplete,
    },
  );
