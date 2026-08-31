import React from "react";

import {
  progressMessageFor,
  type SolveJob,
  type SolveResponse,
} from "./solverHelpers";

interface SolveProgressProps {
  elapsedMs?: number;
  startedAt?: string | null;
  estimatedSeconds: number;
  jobStatus: SolveJob["status"] | null;
  /** Best plan found so far. The solver reaches a usable schedule in seconds
   *  and spends the rest of its budget improving it, so this normally appears
   *  long before the run ends. */
  preview?: SolveResponse | null;
  onAcceptPreview?: () => void;
}

const SolveProgress = ({
  elapsedMs: externalElapsedMs,
  startedAt,
  estimatedSeconds,
  jobStatus,
  preview,
  onAcceptPreview,
}: SolveProgressProps) => {
  const [internalElapsedMs, setInternalElapsedMs] = React.useState(
    externalElapsedMs ?? 0,
  );
  const mountTimeRef = React.useRef(Date.now());

  React.useEffect(() => {
    if (jobStatus && jobStatus !== "PENDING" && jobStatus !== "RUNNING") {
      setInternalElapsedMs(externalElapsedMs ?? 0);
      return;
    }
    const phaseStartedAt = startedAt
      ? Date.parse(startedAt)
      : mountTimeRef.current - (externalElapsedMs ?? 0);
    const update = () => {
      setInternalElapsedMs(Math.max(0, Date.now() - phaseStartedAt));
    };
    update();
    const tick = window.setInterval(update, 100);
    return () => window.clearInterval(tick);
  }, [externalElapsedMs, jobStatus, startedAt]);

  const elapsedMs =
    externalElapsedMs !== undefined && externalElapsedMs > 0
      ? externalElapsedMs
      : internalElapsedMs;
  const waitingForWorker = jobStatus === "PENDING";
  const estimatedMs = estimatedSeconds * 1000;
  // The bar eases along a decelerating curve instead of a straight ramp: the
  // solver reaches a usable plan in the first few seconds and then spends the
  // rest of its budget improving it - a real run averages ~2 minutes - so a
  // bar that sprints to "almost done" and then sits there reads as a frozen
  // solve. This approaches, but never reaches, ~96% no matter how long the
  // run takes, so it is always visibly creeping forward. The time constant is
  // floored at 70s so it is still mid-climb at the two-minute mark and only
  // nears the top if the solve runs its full budget.
  const progressTimeConstantMs = Math.max(estimatedMs, 70_000);
  const progressPercent = waitingForWorker
    ? 12
    : 8 + 88 * (1 - Math.exp(-elapsedMs / progressTimeConstantMs));
  const previewPlaced = preview?.schedule.length ?? 0;
  const previewUnplaced = preview?.unplaceable?.length ?? 0;
  const progressMessage = waitingForWorker
    ? elapsedMs >= 8000
      ? import.meta.env.DEV
        ? "Planleggingstjenesten har ikke hentet jobben — start utviklingsmiljøet med «make dev»."
        : "Planleggingstjenesten har ikke hentet jobben — kontroller bakgrunnstjenesten."
      : "Venter på ledig planleggingstjeneste…"
    : progressMessageFor(elapsedMs, estimatedMs);

  return (
    <div className="border-t border-border-soft bg-surface-mutedSoft px-5 py-3">
      <div
        role="progressbar"
        aria-label="Genererer plan"
        aria-valuenow={
          waitingForWorker ? undefined : Math.round(progressPercent)
        }
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out solver-barberpole-progress"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between gap-2 text-detail text-text-muted">
        <span aria-live="polite">
          {preview ? "Forbedrer planen…" : progressMessage}
        </span>
        <strong className="tabular-nums text-text-primary">
          {(elapsedMs / 1000).toFixed(1)}s
        </strong>
      </div>
      {preview && (
        <div
          className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-muted px-3 py-2"
          data-cy="solve-live-preview"
        >
          <span className="text-detail text-text-primary">
            <strong className="font-semibold">
              {previewPlaced} {previewPlaced === 1 ? "kandidat" : "kandidater"}{" "}
              plassert
            </strong>
            {previewUnplaced > 0
              ? ` — ${previewUnplaced} uten plass så langt.`
              : " — hele planen går opp."}{" "}
            Solveren finpusser videre til den er ferdig.
          </span>
          {onAcceptPreview && (
            <button
              type="button"
              onClick={onAcceptPreview}
              data-cy="solve-accept-preview"
              className="shrink-0 text-ui font-semibold text-brand hover:underline"
            >
              Bruk denne nå
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SolveProgress;
