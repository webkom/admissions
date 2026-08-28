import { useEffect, useRef, useState } from "react";
import type { StatusToastState } from "src/components/StatusToast";
import { useSaveInterviewAvailability } from "src/query/hooks";
import type { Fadderbarn } from "./FadderbarnPicker";
import type {
  ExperienceLevel,
  InterviewAvailabilityParticipant,
} from "src/types";
import { isSensitiveAuthorityChangedError } from "src/query/sensitiveAccess";

type Notify = (message: string, tone?: StatusToastState["tone"]) => void;

const serializeSlots = (slots: Iterable<string>) =>
  Array.from(slots).sort().join("\n");

// DRF validation errors arrive as {field: ["Norwegian message"], ...} (or a
// bare string for non-field errors). The toast must carry the server's actual
// reason - "Kunne ikke lagre tilgjengelighet" alone hid every 400 cause, from
// "Opptaksansvarlig må åpne tidsluker først" to a slot outside the opened
// grid, and left users and recruiters with nothing to act on.
const firstApiErrorMessage = (data: unknown): string | null => {
  if (typeof data === "string") return data || null;
  if (Array.isArray(data)) {
    for (const entry of data) {
      const message = firstApiErrorMessage(entry);
      if (message) return message;
    }
    return null;
  }
  if (data && typeof data === "object") {
    for (const value of Object.values(data as Record<string, unknown>)) {
      const message = firstApiErrorMessage(value);
      if (message) return message;
    }
  }
  return null;
};

// Both halves of the answer, not just the available ones. Keying the
// server-sync below on slots alone meant a remote change that touched only
// discouraged_slots - an admin editing on someone's behalf, say - looked
// identical to no change at all and was never picked up. It also has to
// cover the local-edit guard, so that someone who has only marked "helst
// ikke" slots still counts as having unsaved work worth protecting.
const serializeAnswer = (
  slots: Iterable<string>,
  discouraged: Iterable<string>,
) => `${serializeSlots(slots)}\u0000${serializeSlots(discouraged)}`;

// What the editor holds before any server answer has been applied. It is not
// the empty string: serializeAnswer always joins its two halves, so the empty
// answer carries the separator. Comparing the baseline against "" instead made
// the sync effect below bail on its very first run - every run, for everyone -
// leaving both the saved answer and the generation stamp unadopted, so a save
// omitted expected_availability_generation and the server rejected it.
const EMPTY_ANSWER = serializeAnswer([], []);

interface AvailabilityEditorParams {
  admissionSlug: string;
  groupId: string;
  participants: InterviewAvailabilityParticipant[] | undefined;
  notify: Notify;
  /**
   * The slots the framework currently allows, straight from the saved
   * schedule. The grid is built from these, and the save guard below refuses
   * anything outside them - so a selection that outlived a framework change
   * can never reach the backend as a confusing slot error.
   */
  knownSlots?: Set<string>;
  /**
   * When set, the editor reads and writes this interviewer's availability
   * instead of your own (interview-admin on-behalf editing). Saves are
   * posted with the target's user_id; the backend requires an interview
   * admin to do this.
   */
  targetUserId?: string;
  /**
   * Called when the editor discovers the framework changed underneath it
   * (a selection outside the current enabled slots, or the server's 409).
   * Lets the page refetch schedule + availability so the grid rebuilds
   * against the current plan instead of waiting for the next poll.
   */
  onStale?: () => void;
}

export const useAvailabilityEditor = ({
  admissionSlug,
  groupId,
  participants,
  notify,
  knownSlots,
  targetUserId,
  onStale,
}: AvailabilityEditorParams) => {
  const saveInterviewAvailability = useSaveInterviewAvailability(
    admissionSlug,
    groupId,
  );
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [discouragedSlots, setDiscouragedSlots] = useState<Set<string>>(
    new Set(),
  );
  const lastAppliedServerAnswerRef = useRef<string | null>(null);
  const lastAppliedGenerationRef = useRef<number | null>(null);
  const currentParticipant = participants?.find((participant) =>
    targetUserId ? participant.user_id === targetUserId : participant.is_me,
  );

  // The framework is the single source of truth for which slots exist. When
  // it changes (generation bumps), whatever is on screen - and whatever the
  // user has painted - is stale: the old slots may not exist in the new
  // plan, so saving them would only draw a confusing backend rejection.
  // Detect the bump and reset the editor to the new participant row instead
  // of leaving a stale grid behind.
  const participantGeneration = currentParticipant?.availability_generation;
  const currentParticipantRef = useRef(currentParticipant);
  currentParticipantRef.current = currentParticipant;
  useEffect(() => {
    if (participantGeneration === undefined) return;
    if (lastAppliedGenerationRef.current === participantGeneration) return;
    const participant = currentParticipantRef.current;
    const serverKey = serializeAnswer(
      participant?.slots ?? [],
      participant?.discouraged_slots ?? [],
    );
    lastAppliedGenerationRef.current = participantGeneration;
    lastAppliedServerAnswerRef.current = serverKey;
    setSelectedSlots(new Set(participant?.slots ?? []));
    setDiscouragedSlots(new Set(participant?.discouraged_slots ?? []));
  }, [participantGeneration]);

  useEffect(() => {
    if (!currentParticipant) return;

    const localKey = serializeAnswer(selectedSlots, discouragedSlots);
    const baselineKey = lastAppliedServerAnswerRef.current ?? EMPTY_ANSWER;
    if (localKey !== baselineKey) return;

    const serverKey = serializeAnswer(
      currentParticipant.slots,
      currentParticipant.discouraged_slots ?? [],
    );
    if (serverKey !== lastAppliedServerAnswerRef.current) {
      setSelectedSlots(new Set(currentParticipant.slots));
      setDiscouragedSlots(new Set(currentParticipant.discouraged_slots ?? []));
      lastAppliedServerAnswerRef.current = serverKey;
    }
    lastAppliedGenerationRef.current =
      currentParticipant.availability_generation;
  }, [currentParticipant, discouragedSlots, selectedSlots]);

  const saveAvailability = async (
    slots: Set<string>,
    // Omitted entirely when the caller has nothing to say, so a plain slot
    // save never clears existing declarations. Checked against undefined,
    // not truthiness: an empty array is a real answer ("confirmed none").
    fadderbarn?: Fadderbarn[],
    // Defaults to the editor's current "helst ikke" set so callers that only
    // deal in available slots keep it intact rather than silently clearing it.
    discouraged: Set<string> = discouragedSlots,
  ) => {
    // The backend is the source of truth for which slots exist. A selection
    // holding a slot that is no longer in the framework means the grid was
    // built against a different plan (the framework changed underneath it):
    // refuse up front with the actionable reload message instead of letting
    // the backend answer with a confusing "slot not part of the plan". The
    // "helst ikke" half is checked too - it is submitted as-is, so a stale
    // discouraged slot could otherwise slip past this guard to the backend.
    if (knownSlots) {
      const outsideSlots = Array.from(slots).filter(
        (slot) => !knownSlots.has(slot),
      );
      const outsideDiscouraged = Array.from(discouraged).filter(
        (slot) => !knownSlots.has(slot),
      );
      if (outsideSlots.length > 0 || outsideDiscouraged.length > 0) {
        notify(
          "Tidsoppsettet er endret. Last inn siden på nytt før du bekrefter.",
          "error",
        );
        onStale?.();
        return;
      }
    }
    try {
      const saved = await saveInterviewAvailability.mutateAsync({
        ...(targetUserId ? { user_id: targetUserId } : {}),
        slots: Array.from(slots),
        discouraged_slots: Array.from(discouraged).filter(
          (slot) => !slots.has(slot),
        ),
        ...(fadderbarn !== undefined ? { fadderbarn } : {}),
        expected_availability_generation:
          lastAppliedGenerationRef.current ?? undefined,
      });
      lastAppliedServerAnswerRef.current = serializeAnswer(
        slots,
        saved.discouraged_slots ?? [],
      );
      lastAppliedGenerationRef.current = saved.availability_generation;
      setDiscouragedSlots(new Set(saved.discouraged_slots ?? []));
      notify("Tilgjengelighet lagret.");
    } catch (error) {
      if (isSensitiveAuthorityChangedError(error)) throw error;
      const response = (
        error as { response?: { status?: number; data?: unknown } }
      ).response;
      const stale = response?.status === 409;
      notify(
        stale
          ? "Tidsoppsettet er endret. Last inn siden på nytt før du bekrefter."
          : `Kunne ikke lagre tilgjengelighet${
              firstApiErrorMessage(response?.data)
                ? `: ${firstApiErrorMessage(response?.data)}`
                : ""
            }`,
        "error",
      );
      if (stale) onStale?.();
      throw error;
    }
  };

  const saveConflictReview = async (
    reviewedCandidateIds: string[],
    conflictIds: string[],
  ) => {
    try {
      await saveInterviewAvailability.mutateAsync({
        reviewed_candidate_ids: reviewedCandidateIds,
        conflicts: conflictIds,
      });
    } catch (error) {
      if (isSensitiveAuthorityChangedError(error)) throw error;
      const response = (
        error as { response?: { status?: number; data?: unknown } }
      ).response;
      notify(
        `Kunne ikke lagre inhabilitetssjekken${
          firstApiErrorMessage(response?.data)
            ? `: ${firstApiErrorMessage(response?.data)}`
            : ""
        }`,
        "error",
      );
      throw error;
    }
  };

  // Admin on-behalf inhabilitet editing: replaces the target interviewer's
  // declared conflicts (candidate ids only - the admin's scope is the whole
  // candidate pool, so no review declaration is needed) without touching
  // their slots or reviewed candidates.
  const saveConflictReviewFor = async (
    targetUserId: string,
    conflictIds: string[],
  ) => {
    try {
      await saveInterviewAvailability.mutateAsync({
        user_id: targetUserId,
        conflicts: conflictIds,
      });
    } catch (error) {
      if (isSensitiveAuthorityChangedError(error)) throw error;
      const response = (
        error as { response?: { status?: number; data?: unknown } }
      ).response;
      notify(
        `Kunne ikke lagre inhabilitetene${
          firstApiErrorMessage(response?.data)
            ? `: ${firstApiErrorMessage(response?.data)}`
            : ""
        }`,
        "error",
      );
      throw error;
    }
  };

  const setParticipation = async (
    participation: "awaiting_response" | "not_participating",
    userId?: string,
  ) => {
    try {
      await saveInterviewAvailability.mutateAsync({
        user_id: userId,
        participation,
        expected_availability_generation:
          lastAppliedGenerationRef.current ??
          currentParticipant?.availability_generation ??
          undefined,
      });
      if (!userId || userId === currentParticipant?.user_id) {
        setSelectedSlots(new Set());
        setDiscouragedSlots(new Set());
        lastAppliedServerAnswerRef.current = serializeAnswer([], []);
      }
      notify(
        participation === "not_participating"
          ? "Registrert som ikke deltakende."
          : "Intervjueren må sende inn tilgjengelighet.",
      );
    } catch (error) {
      if (isSensitiveAuthorityChangedError(error)) throw error;
      notify("Kunne ikke oppdatere deltakelsen.", "error");
      throw error;
    }
  };

  const setExperienceLevel = async (
    userId: string,
    experienceLevel: ExperienceLevel,
  ) => {
    try {
      await saveInterviewAvailability.mutateAsync({
        user_id: userId,
        experience_level: experienceLevel,
      });
      notify("Erfaringsnivå oppdatert.");
    } catch (error) {
      if (isSensitiveAuthorityChangedError(error)) throw error;
      notify("Kunne ikke oppdatere erfaringsnivå.", "error");
      throw error;
    }
  };

  return {
    selectedSlots,
    setSelectedSlots,
    discouragedSlots,
    setDiscouragedSlots,
    currentParticipant,
    saveAvailability,
    saveConflictReview,
    saveConflictReviewFor,
    setParticipation,
    setExperienceLevel,
  };
};
