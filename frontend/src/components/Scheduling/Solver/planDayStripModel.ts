/**
 * The one picture the scheduling flow is built on.
 *
 * Framework days, the plan and the publication are all *prefixes of the same
 * ordered list of days*: the framework says which days exist, the solver fills
 * them left to right, and publication releases them left to right. Every
 * "extend" action in the flow is one of these two cursors moving right.
 *
 * Deriving the cells here keeps that invariant in one testable place instead of
 * spread across the setup panel, the publish gate and the published plan.
 */

export type PlanDayState =
  /** Released to the committee. Immutable. */
  | "published"
  /** Has interviews, still only the recruiter's. */
  | "planned"
  /** Open slots exist, nothing placed there yet. */
  | "unplanned"
  /** In the period but with no open slots - nothing can be planned here. */
  | "closed";

export interface PlanDayCell {
  date: string;
  index: number;
  state: PlanDayState;
  /** Solving through this day would extend the plan. */
  canPlanThrough: boolean;
  /** Publishing through this day would extend the publication. */
  canPublishThrough: boolean;
}

export interface PlanDayStripModel {
  cells: PlanDayCell[];
  /** Index of the last published day, or -1 when nothing is published. */
  publishedThroughIndex: number;
  /** Index of the last day inside a previewed boundary, or -1. Distinct from
   *  `publishedThroughIndex`: a preview is a proposal the user can still
   *  revise, so those days stay actionable. */
  previewThroughIndex: number;
  /** Index of the last day holding interviews, or -1 when the draft is empty. */
  plannedThroughIndex: number;
  publishedCount: number;
  plannedCount: number;
  /** Plannable days with nothing on them yet. */
  unplannedCount: number;
  /** Planned days the committee has not been shown - what "publish more" would
   *  release. */
  publishableCount: number;
}

export const derivePlanDayStrip = ({
  dates,
  plannableDates,
  filledDates,
  distributedThrough,
  previewThrough = null,
  canPlan = false,
  canPublish = false,
}: {
  /** Every framework day, in order. */
  dates: string[];
  /** Framework days with at least one open slot. */
  plannableDates: readonly string[];
  /** Days holding at least one placed interview. */
  filledDates: ReadonlySet<string>;
  distributedThrough: string | null;
  /** A boundary the user is choosing but has not committed. Highlighted, but
   *  not treated as published - they must be able to pick a different day. */
  previewThrough?: string | null;
  /** The viewer may move the plan cursor (recruiter, not mid-solve). */
  canPlan?: boolean;
  /** The viewer may move the publication cursor. */
  canPublish?: boolean;
}): PlanDayStripModel => {
  const sorted = [...dates].sort();
  const plannable = new Set(plannableDates);

  let publishedThroughIndex = -1;
  let previewThroughIndex = -1;
  let plannedThroughIndex = -1;
  sorted.forEach((date, index) => {
    if (distributedThrough && date <= distributedThrough) {
      publishedThroughIndex = index;
    }
    if (previewThrough && date <= previewThrough) previewThroughIndex = index;
    if (filledDates.has(date)) plannedThroughIndex = index;
  });

  const cells = sorted.map((date, index): PlanDayCell => {
    const isPublished = index <= publishedThroughIndex;
    const state: PlanDayState = isPublished
      ? "published"
      : filledDates.has(date)
        ? "planned"
        : plannable.has(date)
          ? "unplanned"
          : "closed";
    return {
      date,
      index,
      state,
      // Planning targets a day past what the draft already covers. A closed
      // day has nothing to solve into, and a published day is settled.
      canPlanThrough:
        canPlan && state !== "closed" && state !== "published" && !isPublished,
      // Publishing only ever moves forward, and only over days that actually
      // hold interviews - releasing an empty day tells the committee nothing
      // and burns a boundary that can never be moved back.
      canPublishThrough:
        canPublish && !isPublished && index <= plannedThroughIndex,
    };
  });

  const publishedCount = publishedThroughIndex + 1;
  return {
    cells,
    publishedThroughIndex,
    previewThroughIndex,
    plannedThroughIndex,
    publishedCount,
    plannedCount: cells.filter((cell) => cell.state === "planned").length,
    unplannedCount: cells.filter((cell) => cell.state === "unplanned").length,
    publishableCount: Math.max(0, plannedThroughIndex + 1 - publishedCount),
  };
};
