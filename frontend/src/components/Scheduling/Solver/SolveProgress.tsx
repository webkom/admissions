import React from "react";

import { progressMessageFor, type SolveJob } from "./solverHelpers";

interface SolveProgressProps {
  elapsedMs?: number;
  startedAt?: string | null;
  estimatedSeconds: number;
  jobStatus: SolveJob["status"] | null;
}

const SolveProgress = ({
  elapsedMs: externalElapsedMs,
  startedAt,
  estimatedSeconds,
  jobStatus,
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
  const progressTargetMs = estimatedMs * 1.35;
  const progressPercent = waitingForWorker
    ? 12
    : Math.min(
        97,
        elapsedMs <= progressTargetMs
          ? (elapsedMs / Math.max(progressTargetMs, 1)) * 92
          : 92 + Math.min(5, ((elapsedMs - progressTargetMs) / 1000) * 0.08),
      );
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
        <span aria-live="polite">{progressMessage}</span>
        <strong className="tabular-nums text-text-primary">
          {(elapsedMs / 1000).toFixed(1)}s
        </strong>
      </div>
    </div>
  );
};

export default SolveProgress;
