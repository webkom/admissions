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
  const lastAppliedServerSlotsRef = useRef<string | null>(null);
  const lastAppliedGenerationRef = useRef<number | null>(null);
  const currentParticipant = participants?.find(
    (participant) => participant.is_me,
  );

  useEffect(() => {
    if (!currentParticipant) return;

    const localKey = serializeSlots(selectedSlots);
    const baselineKey = lastAppliedServerSlotsRef.current ?? "";
    if (localKey !== baselineKey) return;

    const serverKey = serializeSlots(currentParticipant.slots);
    if (serverKey !== lastAppliedServerSlotsRef.current) {
      setSelectedSlots(new Set(currentParticipant.slots));
      setDiscouragedSlots(new Set(currentParticipant.discouraged_slots ?? []));
      lastAppliedServerSlotsRef.current = serverKey;
    }
    lastAppliedGenerationRef.current =
      currentParticipant.availability_generation;
  }, [currentParticipant, selectedSlots]);

  const saveAvailability = async (
    slots: Set<string>,
    // Sent alongside the slots so declaring a fadderbarn is part of answering,
    // not a second thing to remember. Omitted entirely when the caller has
    // nothing to say, so a plain slot save never clears existing declarations.
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
        ...(fadderbarn ? { fadderbarn } : {}),
        expected_availability_generation:
          lastAppliedGenerationRef.current ?? undefined,
      });
      lastAppliedServerSlotsRef.current = serializeSlots(slots);
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
        lastAppliedServerSlotsRef.current = "";
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
