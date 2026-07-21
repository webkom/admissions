import { useEffect, useRef, useState } from "react";
import type { StatusToastState } from "src/components/StatusToast";
import { useSaveInterviewAvailability } from "src/query/hooks";
import type { InterviewAvailabilityParticipant } from "src/types";

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
  const currentParticipant = participants?.find(
    (participant) => participant.is_me,
  );

  useEffect(() => {
    if (!currentParticipant) return;

    const serverKey = serializeSlots(currentParticipant.slots);
    if (serverKey === lastAppliedServerSlotsRef.current) return;

    const localKey = serializeSlots(selectedSlots);
    const baselineKey = lastAppliedServerSlotsRef.current ?? "";
    if (localKey !== baselineKey) return;

    setSelectedSlots(new Set(currentParticipant.slots));
    lastAppliedServerSlotsRef.current = serverKey;
  }, [currentParticipant, selectedSlots]);

  const saveAvailability = async (slots: Set<string>) => {
    try {
      await saveInterviewAvailability.mutateAsync({
        slots: Array.from(slots),
      });
      lastAppliedServerSlotsRef.current = serializeSlots(slots);
      notify("Tilgjengelighet lagret.");
    } catch {
      notify("Kunne ikke lagre tilgjengelighet.", "error");
      throw new Error("Kunne ikke lagre tilgjengelighet.");
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

  return {
    selectedSlots,
    setSelectedSlots,
    currentParticipant,
    saveAvailability,
    saveConflictReview,
  };
};
