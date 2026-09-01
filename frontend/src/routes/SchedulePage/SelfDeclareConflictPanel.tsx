import React, { useMemo, useState } from "react";
import { AlertTriangle, Check, Search } from "lucide-react";
import {
  actionButtonBase,
  actionButtonNeutral,
  actionButtonPrimary,
  keyboardFocusRingClass,
} from "src/components/Scheduling/ui";
import { iconSizes } from "src/styles/designTokens";
import type { Candidate } from "src/types";
import cn from "src/utils/cn";

/**
 * The standing self-declare action: "I am disqualified for one of these
 * candidates", available at any point once names are visible to the reader -
 * before publication finishes, after it, whether or not anyone's own
 * inhabilitetssjekk was ever completed. This is the safety valve a passive
 * list of other people's names never was: the one thing an ordinary
 * committee member can actually act on.
 *
 * Collapsed to a single button by default so it does not compete with the
 * plan itself for attention; opens into a searchable checklist scoped to
 * whatever candidate list the reader is allowed to see.
 */
const SelfDeclareConflictPanel: React.FC<{
  candidates: Candidate[];
  /** This reader's own already-declared conflicts - shown as settled, not
   *  re-offered. */
  alreadyDeclared: ReadonlySet<string>;
  onDeclare: (candidateIds: string[]) => Promise<void>;
  /** Prefixes the panel with the audit-relevant names an admin can act on -
   *  never shown to an ordinary member, who has no standing to follow up
   *  with them anyway. */
  waivedReviewerNames?: string[];
}> = ({ candidates, alreadyDeclared, onDeclare, waivedReviewerNames = [] }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  // This is a standing action on every published plan, so it stays quiet by
  // default: a permanently warning-coloured bar teaches people to read that
  // colour as decoration, and then the one plan that actually went out with
  // an unfinished inhabilitetssjekk looks exactly like all the others. Only
  // that case earns the warning treatment.
  const alarming = waivedReviewerNames.length > 0;

  const declarable = useMemo(
    () =>
      [...candidates]
        .filter((candidate) => !alreadyDeclared.has(candidate.id))
        .sort((left, right) => left.name.localeCompare(right.name, "nb")),
    [candidates, alreadyDeclared],
  );
  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return declarable;
    return declarable.filter((candidate) =>
      candidate.name.toLowerCase().includes(trimmed),
    );
  }, [declarable, query]);

  const toggle = (candidateId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  };

  const closePanel = () => {
    setOpen(false);
    setQuery("");
    setSelected(new Set());
  };

  const submit = async () => {
    if (selected.size === 0 || isSaving) return;
    setIsSaving(true);
    try {
      await onDeclare([...selected]);
      closePanel();
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) {
    return (
      <div
        data-cy="self-declare-conflict-banner"
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3 text-ui",
          alarming
            ? "border-warning-border bg-warning-bg text-warning-text"
            : "border-border-soft bg-surface-subtle text-text-muted",
        )}
      >
        <span className="min-w-0">
          {alarming && (
            <span className="mr-1 font-semibold">
              Publisert uten fullført inhabilitetssjekk fra{" "}
              {waivedReviewerNames.join(", ")}.
            </span>
          )}
          Er du inhabil i et av intervjuene under? Meld fra her.
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-cy="self-declare-conflict-open"
          className={cn(actionButtonBase, actionButtonNeutral, "flex-none")}
        >
          <AlertTriangle size={iconSizes.tiny} aria-hidden="true" />
          Meld innhabilitet
        </button>
      </div>
    );
  }

  return (
    <div
      data-cy="self-declare-conflict-panel"
      className={cn(
        "border-b px-6 py-4",
        alarming
          ? "border-warning-border bg-warning-bg"
          : "border-border-soft bg-surface-subtle",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className={cn(
              "m-0 text-ui font-bold",
              alarming ? "text-warning-text" : "text-text-primary",
            )}
          >
            Meld innhabilitet
          </h2>
          <p
            className={cn(
              "m-0 mt-1 text-detail",
              alarming ? "text-warning-text" : "text-text-muted",
            )}
          >
            Kryss av kandidatene du er inhabil for. Dette legges til det du
            eventuelt alt har meldt - ingenting du har krysset av tidligere
            forsvinner.
          </p>
        </div>
        {declarable.length > 6 && (
          <div className="relative min-w-48">
            <Search
              size={iconSizes.tiny}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Søk kandidater…"
              className="w-full rounded-md border border-border-soft bg-surface-base py-1.5 pl-8 pr-3 text-ui placeholder:text-text-faded focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-ringSoft"
            />
          </div>
        )}
      </div>

      <ul className="m-0 mt-3 max-h-80 divide-y divide-border-faint overflow-y-auto overflow-x-hidden rounded-lg border border-border-soft bg-surface-base p-0">
        {filtered.length === 0 ? (
          <li className="p-4 text-center text-detail text-text-muted">
            {query
              ? `Ingen kandidater matcher «${query}».`
              : "Ingen flere kandidater å melde inhabilitet for."}
          </li>
        ) : (
          filtered.map((candidate) => {
            const isSelected = selected.has(candidate.id);
            return (
              <li key={candidate.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors",
                    isSelected
                      ? "bg-danger-bg"
                      : "bg-surface-base hover:bg-surface-subtle",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(candidate.id)}
                    data-cy={`self-declare-candidate-${candidate.id}`}
                    className="h-4 w-4 flex-none rounded border-border-muted text-danger focus:ring-danger"
                  />
                  <span className="min-w-0 flex-1 truncate text-ui font-semibold text-text-primary">
                    {candidate.name}
                  </span>
                  {isSelected && (
                    <span className="text-detail font-semibold text-danger">
                      Inhabil
                    </span>
                  )}
                </label>
              </li>
            );
          })
        )}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span
          className={cn(
            "text-detail",
            selected.size > 0
              ? "font-semibold text-danger"
              : alarming
                ? "text-warning-text"
                : "text-text-muted",
          )}
        >
          {selected.size === 0
            ? "Ingen valgt"
            : `${selected.size} kandidat${selected.size === 1 ? "" : "er"} valgt`}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={closePanel}
            className={cn(actionButtonBase, actionButtonNeutral)}
          >
            Avbryt
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || isSaving}
            onClick={() => void submit()}
            data-cy="self-declare-conflict-submit"
            className={cn(
              actionButtonBase,
              actionButtonPrimary,
              keyboardFocusRingClass,
            )}
          >
            <Check size={iconSizes.small} aria-hidden="true" />
            {isSaving ? "Lagrer…" : "Bekreft inhabilitet"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SelfDeclareConflictPanel;
