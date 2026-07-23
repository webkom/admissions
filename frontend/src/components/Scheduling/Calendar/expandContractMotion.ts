import { gsap } from "gsap";

export const EXPAND_CONTRACT_MOTION = {
  durationSeconds: 0.5,
  enterEase: "power2.out",
  exitEase: "power2.inOut",
  transformOrigin: "center top",
  reducedMotionQuery: "(prefers-reduced-motion: reduce)",
  enterClearProps: "opacity,visibility,transform",
} as const;

export interface ExpandContractState {
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

export const setExpandedElement = (element: HTMLElement, height: number) => {
  gsap.set(element, {
    autoAlpha: 1,
    height,
    scaleY: 1,
    transformOrigin: EXPAND_CONTRACT_MOTION.transformOrigin,
    clearProps: EXPAND_CONTRACT_MOTION.enterClearProps,
  });
};

export const animateExpandedElement = ({
  element,
  from,
  height,
  durationSeconds = EXPAND_CONTRACT_MOTION.durationSeconds,
}: {
  element: HTMLElement;
  from: ExpandContractState;
  height: number;
  durationSeconds?: number;
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
      clearProps: EXPAND_CONTRACT_MOTION.enterClearProps,
    },
  );

export const animateExpandedElementOnNextFrame = ({
  resolveElement,
  from,
  height,
  durationSeconds,
  onStart,
}: {
  resolveElement: () => HTMLElement | null;
  from: ExpandContractState;
  height: number | ((element: HTMLElement) => number);
  durationSeconds?: number;
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
