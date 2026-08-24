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
}

export const useAvailabilityEditor = ({
  admissionSlug,
  groupId,
  participants,
  notify,
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
  const currentParticipant = participants?.find(
    (participant) => participant.is_me,
  );

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
    try {
      const saved = await saveInterviewAvailability.mutateAsync({
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
      const responseStatus = (error as { response?: { status?: number } })
        .response?.status;
      notify(
        responseStatus === 409
          ? "Tidsoppsettet er endret. Last inn siden på nytt før du bekrefter."
          : "Kunne ikke lagre tilgjengelighet.",
        "error",
      );
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
      notify("Kunne ikke lagre inhabilitetssjekken.", "error");
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
    setParticipation,
    setExperienceLevel,
  };
};
