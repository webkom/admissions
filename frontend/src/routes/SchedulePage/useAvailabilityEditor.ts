import { useEffect, useRef, useState } from "react";
import type { StatusToastState } from "src/components/StatusToast";
import { useSaveInterviewAvailability } from "src/query/hooks";
import type {
  ExperienceLevel,
  InterviewAvailabilityParticipant,
} from "src/types";

type Notify = (message: string, tone?: StatusToastState["tone"]) => void;

const serializeSlots = (slots: Iterable<string>) =>
  Array.from(slots).sort().join("\n");

interface AvailabilityEditorParams {
  admissionSlug: string;
  participants: InterviewAvailabilityParticipant[] | undefined;
  notify: Notify;
}

export const useAvailabilityEditor = ({
  admissionSlug,
  participants,
  notify,
}: AvailabilityEditorParams) => {
  const saveInterviewAvailability = useSaveInterviewAvailability(admissionSlug);
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
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
      lastAppliedServerSlotsRef.current = serverKey;
    }
    lastAppliedGenerationRef.current =
      currentParticipant.availability_generation;
  }, [currentParticipant, selectedSlots]);

  const saveAvailability = async (slots: Set<string>) => {
    try {
      const saved = await saveInterviewAvailability.mutateAsync({
        slots: Array.from(slots),
        expected_availability_generation:
          lastAppliedGenerationRef.current ?? undefined,
      });
      lastAppliedServerSlotsRef.current = serializeSlots(slots);
      lastAppliedGenerationRef.current = saved.availability_generation;
      notify("Tilgjengelighet lagret.");
    } catch (error) {
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
        lastAppliedServerSlotsRef.current = "";
      }
      notify(
        participation === "not_participating"
          ? "Registrert som ikke deltakende."
          : "Intervjueren må sende inn tilgjengelighet.",
      );
    } catch (error) {
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
      notify("Kunne ikke oppdatere erfaringsnivå.", "error");
      throw error;
    }
  };

  return {
    selectedSlots,
    setSelectedSlots,
    currentParticipant,
    saveAvailability,
    saveConflictReview,
    setParticipation,
    setExperienceLevel,
  };
};
