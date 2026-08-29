import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import TimeScheduler from "src/components/Scheduling/Calendar/Calendar";
import {
  actionButtonBase,
  actionButtonPrimary,
} from "src/components/Scheduling/ui";
import type { StatusToastState } from "src/components/StatusToast";
import { isSensitiveAuthorityChangedError } from "src/query/sensitiveAccess";
import type { Candidate, InterviewAvailabilityParticipant } from "src/types";
import cn from "src/utils/cn";
import { useAvailabilityEditor } from "./useAvailabilityEditor";

interface OnBehalfAvailabilityEditorProps {
  admissionSlug: string;
  groupId: string;
  /** The interviewer whose availability is being edited. */
  targetUserId: string;
  participants: InterviewAvailabilityParticipant[] | undefined;
  /** Named candidate pool (admin sees names); used to render inhabilitet. */
  candidates?: Candidate[] | undefined;
  notify: (message: string, tone?: StatusToastState["tone"]) => void;
  enabledSlots: Set<string>;
  dates: string[];
  sessionDuration: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  dayStartMinute: number;
  dayEndMinute: number;
  onClose: () => void;
}

/**
 * Admin on-behalf availability editor: an interview admin picks an
 * interviewer and edits their slot grid directly, without logging in as
 * them. Saves are posted with the target's user_id (the backend requires an
 * interview admin for that). Keyed by targetUserId by the caller so
 * switching targets remounts the editor with a fresh baseline.
 */

const OnBehalfAvailabilityEditor: React.FC<OnBehalfAvailabilityEditorProps> = ({
  admissionSlug,
  groupId,
  targetUserId,
  participants,
  candidates,
  notify,
  enabledSlots,
  dates,
  sessionDuration,
  chunkSize,
  chunkBreakMinutes,
  dayStartMinute,
  dayEndMinute,
  onClose,
}) => {
  const availability = useAvailabilityEditor({
    admissionSlug,
    groupId,
    participants,
    notify,
    knownSlots: enabledSlots,
    targetUserId,
  });
  const target = participants?.find(
    (participant) => participant.user_id === targetUserId,
  );
  const targetName = target?.full_name || target?.username || "intervjueren";
  const sectionRef = useRef<HTMLElement | null>(null);

  // Inhabilitet: the target's declared conflicts, rendered as a searchable
  // checkbox list over the named candidate pool.
  const [selectedConflictIds, setSelectedConflictIds] = useState(
    () => new Set(target?.conflicts ?? []),
  );
  const [conflictFilter, setConflictFilter] = useState("");
  const [conflictsDirty, setConflictsDirty] = useState(false);
  const [conflictsSaving, setConflictsSaving] = useState(false);
  // Hydrate the checkbox list from the server row exactly once, when the row
  // first arrives. After that the local selection is authoritative: the
  // roster query polls, so re-reading `target.conflicts` on every poll would
  // fight an in-progress edit - and, worse, snap the list back to the
  // pre-save state in the gap between a save completing and the roster
  // refetch echoing it (or whenever the row is briefly absent mid-refetch).
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || !target) return;
    hydratedRef.current = true;
    setSelectedConflictIds(new Set(target.conflicts ?? []));
  }, [target]);

  const toggleConflict = (candidateId: string) => {
    setSelectedConflictIds((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
    setConflictsDirty(true);
  };

  const visibleCandidates = useMemo(() => {
    const filter = conflictFilter.trim().toLowerCase();
    const list = [...(candidates ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name, "nb"),
    );
    if (!filter) return list;
    return list.filter((candidate) =>
      candidate.name.toLowerCase().includes(filter),
    );
  }, [candidates, conflictFilter]);

  const saveConflicts = async () => {
    setConflictsSaving(true);
    try {
      await availability.saveConflictReviewFor(
        targetUserId,
        Array.from(selectedConflictIds),
      );
      setConflictsDirty(false);
      notify("Inhabiliteter lagret.");
    } catch (error) {
      // saveConflictReviewFor toasts ordinary failures itself, but it
      // re-throws the authority-changed case silently - surface that here so
      // a failed save is never left looking like it worked.
      if (isSensitiveAuthorityChangedError(error)) {
        notify(
          "Rettighetene dine endret seg under lagringen – last inn siden på nytt.",
          "error",
        );
      }
    } finally {
      setConflictsSaving(false);
    }
  };

  // The editor renders below the entire heatmap + roster; without this, opening
  // it can look like "nothing happened" when it lands below the fold.
  useEffect(() => {
    sectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-label={`Rediger tilgjengelighet for ${targetName}`}
      data-cy="on-behalf-availability-editor"
      className="rounded-panel border border-border bg-surface-base"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
        <div>
          <h2 className="m-0 text-ui font-bold text-text-primary">
            Rediger tilgjengelighet for {targetName}
          </h2>
          <p className="m-0 mt-0.5 text-detail text-text-muted">
            Du redigerer som intervjuansvarlig – intervjueren trenger ikke logge
            inn.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1.5 text-text-muted hover:bg-surface-neutral hover:text-text-primary"
          aria-label="Lukk"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <TimeScheduler
        enabledSlots={enabledSlots}
        selectedSlots={availability.selectedSlots}
        onSlotsChange={availability.setSelectedSlots}
        discouragedSlots={availability.discouragedSlots}
        onDiscouragedChange={availability.setDiscouragedSlots}
        dates={dates}
        sessionDuration={sessionDuration}
        chunkSize={chunkSize}
        chunkBreakMinutes={chunkBreakMinutes}
        dayStartMinute={dayStartMinute}
        dayEndMinute={dayEndMinute}
        onSave={(slots, discouraged) =>
          availability.saveAvailability(slots, undefined, discouraged)
        }
        participation={availability.currentParticipant?.participation}
        affectedAssignmentCount={
          availability.currentParticipant?.affected_assignment_count ?? 0
        }
        onOptOut={() =>
          availability.setParticipation("not_participating", targetUserId)
        }
        onRejoin={() =>
          availability.setParticipation("awaiting_response", targetUserId)
        }
      />
      <div className="border-t border-border-soft px-4 py-4">
        <h3 className="m-0 text-ui font-bold text-text-primary">
          Inhabiliteter
        </h3>
        <p className="m-0 mt-1 text-detail text-text-muted">
          Kandidatene {targetName} er inhabil for – de blir ikke satt opp til å
          intervjue dem. Endringene lagres direkte på intervjuerens rad.
        </p>
        {target?.derived_conflicts?.length ? (
          <p className="m-0 mt-1 text-detail text-text-muted">
            I tillegg {target.derived_conflicts.length} fra fadderbarn-
            deklarasjoner:{" "}
            {target.derived_conflicts
              .map(
                (id) =>
                  candidates?.find((candidate) => candidate.id === id)?.name,
              )
              .filter(Boolean)
              .join(", ") || "(navn skjult)"}
          </p>
        ) : null}
        <div className="relative mt-3">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="search"
            value={conflictFilter}
            onChange={(event) => setConflictFilter(event.target.value)}
            placeholder="Søk etter kandidat…"
            className="w-full rounded-md border border-border bg-surface-base py-1.5 pl-8 pr-3 text-detail text-text-primary"
          />
        </div>
        <ul className="mt-2 max-h-64 overflow-y-auto rounded-md border border-border-soft">
          {visibleCandidates.map((candidate) => {
            const checked = selectedConflictIds.has(candidate.id);
            return (
              <li key={candidate.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-detail",
                    "hover:bg-surface-neutral",
                    checked ? "bg-surface-neutral" : "",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleConflict(candidate.id)}
                    className="h-3.5 w-3.5 accent-danger"
                  />
                  <span
                    className={cn(
                      "flex-1",
                      checked
                        ? "font-semibold text-danger"
                        : "text-text-primary",
                    )}
                  >
                    {candidate.name}
                  </span>
                  {checked && (
                    <Check
                      size={14}
                      aria-hidden="true"
                      className="text-danger"
                    />
                  )}
                </label>
              </li>
            );
          })}
          {visibleCandidates.length === 0 && (
            <li className="px-3 py-3 text-detail text-text-muted">
              Ingen kandidater funnet.
            </li>
          )}
        </ul>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-detail text-text-muted">
            {selectedConflictIds.size} registrerte inhabilitet
            {selectedConflictIds.size === 1 ? "" : "er"}
            {conflictsDirty ? " – ulagrede endringer" : ""}
          </span>
          <button
            type="button"
            disabled={conflictsSaving}
            onClick={() => void saveConflicts()}
            className={cn(actionButtonBase, actionButtonPrimary)}
          >
            {conflictsSaving ? "Lagrer…" : "Lagre inhabiliteter"}
          </button>
        </div>
      </div>
    </section>
  );
};

export default OnBehalfAvailabilityEditor;
