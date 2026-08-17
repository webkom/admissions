import React from "react";
import { DateTime } from "luxon";
import { RotateCcw, X } from "lucide-react";
import cn from "src/utils/cn";

interface UnsavedDraftBannerProps {
  /** ISO timestamp of the local draft. */
  draftUpdatedAt: string;
  onRestore: () => void;
  onDiscard: () => void;
}

/**
 * Offers a newer local draft without applying it.
 *
 * The submitted application stays on screen until the applicant chooses, so
 * neither copy is silently thrown away — the previous behaviour discarded the
 * draft, and blindly preferring it would resurrect text deleted elsewhere.
 */
const UnsavedDraftBanner: React.FC<UnsavedDraftBannerProps> = ({
  draftUpdatedAt,
  onRestore,
  onDiscard,
}) => {
  const saved = DateTime.fromISO(draftUpdatedAt).setLocale("nb");
  const when = saved.isValid ? saved.toRelative() : null;

  return (
    <div
      role="status"
      data-cy="unsaved-draft-banner"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-100 px-4 py-3"
    >
      <p className="m-0 flex-1 text-ui font-semibold text-amber-900">
        Du har ulagrede endringer{when ? ` fra ${when}` : ""}.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRestore}
          data-cy="restore-draft"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5",
            "text-detail font-bold text-amber-900 hover:bg-amber-50",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900",
          )}
        >
          <RotateCcw size={14} aria-hidden="true" />
          Gjenopprett
        </button>
        <button
          type="button"
          onClick={onDiscard}
          data-cy="discard-draft"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5",
            "text-detail font-semibold text-amber-900 hover:bg-amber-50",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900",
          )}
        >
          <X size={14} aria-hidden="true" />
          Forkast
        </button>
      </div>
    </div>
  );
};

export default UnsavedDraftBanner;
