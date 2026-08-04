import { useEffect, useRef, useState } from "react";
import type { StatusToastTone } from "src/components/Scheduling/types";
import { useSaveInterviewAvailability } from "src/query/hooks";
import type {
  ExperienceLevel,
  InterviewAvailabilityParticipant,
  SavedSchedule,
} from "src/types";
import { isSensitiveAuthorityChangedError } from "src/query/sensitiveAccess";

type Notify = (message: string, tone?: StatusToastTone) => void;

const serializeSlots = (slots: Iterable<string>) =>
  Array.from(slots).sort().join("\n");

interface AvailabilityEditorParams {
  admissionSlug: string;
  participants: InterviewAvailabilityParticipant[] | undefined;
  savedSchedule: SavedSchedule | undefined;
  refetchSavedSchedule: () => Promise<SavedSchedule | undefined>;
  notify: Notify;
}

export const useAvailabilityEditor = ({
  admissionSlug,
  participants,
  savedSchedule,
  refetchSavedSchedule,
  notify,
}: AvailabilityEditorParams) => {
  const saveInterviewAvailability = useSaveInterviewAvailability(admissionSlug);
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const lastAppliedServerSlotsRef = useRef<string | null>(null);
  const lastAppliedGenerationRef = useRef<number | null>(null);
  const availabilityRevisionByUserRef = useRef<Map<string, string | null>>(
    new Map(),
  );
  const currentParticipant = participants?.find(
    (participant) => participant.is_me,
  );

  useEffect(() => {
    for (const participant of participants ?? []) {
      const currentRevision = availabilityRevisionByUserRef.current.get(
        participant.user_id,
      );
      const serverRevision = participant.availability_updated_at ?? null;
      if (
        currentRevision === undefined ||
        (serverRevision !== null &&
          (currentRevision === null || serverRevision > currentRevision))
      ) {
        availabilityRevisionByUserRef.current.set(
          participant.user_id,
          serverRevision,
        );
      }
    }
  }, [participants]);

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

  const expectedAvailabilityUpdatedAt = (userId: string | undefined) => {
    const targetUserId = userId ?? currentParticipant?.user_id;
    if (!targetUserId) return null;
    if (availabilityRevisionByUserRef.current.has(targetUserId)) {
      return availabilityRevisionByUserRef.current.get(targetUserId) ?? null;
    }
    return (
      participants?.find((participant) => participant.user_id === targetUserId)
        ?.availability_updated_at ?? null
    );
  };

  const rememberAvailabilityRevision = (
    participant: InterviewAvailabilityParticipant,
  ) => {
    availabilityRevisionByUserRef.current.set(
      participant.user_id,
      participant.availability_updated_at ?? null,
    );
  };

  const reportAutoUnpublish = async (wasDistributed: boolean) => {
    if (!wasDistributed) return false;
    let canonicalSchedule: SavedSchedule | undefined;
    try {
      canonicalSchedule = await refetchSavedSchedule();
    } catch {
      notify(
        "Endringen ble lagret, men planstatus kunne ikke kontrolleres. Last inn siden på nytt.",
        "error",
      );
      return true;
    }
    if (!canonicalSchedule) {
      notify(
        "Endringen ble lagret, men planstatus kunne ikke kontrolleres. Last inn siden på nytt.",
        "error",
      );
      return true;
    }
    if (canonicalSchedule.is_distributed) return false;
    notify(
      "Den publiserte planen ble tatt ned og beholdt som utkast fordi tildelte intervjuer må repareres.",
      "error",
    );
    return true;
  };

  const saveAvailability = async (slots: Set<string>) => {
    const wasDistributed = Boolean(savedSchedule?.is_distributed);
    try {
      const saved = await saveInterviewAvailability.mutateAsync({
        slots: Array.from(slots),
        expected_availability_generation:
          lastAppliedGenerationRef.current ?? undefined,
        expected_availability_updated_at: expectedAvailabilityUpdatedAt(
          currentParticipant?.user_id,
        ),
      });
      rememberAvailabilityRevision(saved);
      lastAppliedServerSlotsRef.current = serializeSlots(slots);
      lastAppliedGenerationRef.current = saved.availability_generation;
      if (await reportAutoUnpublish(wasDistributed)) return;
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
    const wasDistributed = Boolean(savedSchedule?.is_distributed);
    try {
      const saved = await saveInterviewAvailability.mutateAsync({
        reviewed_candidate_ids: reviewedCandidateIds,
        conflicts: conflictIds,
        expected_availability_updated_at: expectedAvailabilityUpdatedAt(
          currentParticipant?.user_id,
        ),
      });
      rememberAvailabilityRevision(saved);
      await reportAutoUnpublish(wasDistributed);
    } catch (error) {
      if (isSensitiveAuthorityChangedError(error)) throw error;
      notify("Kunne ikke lagre inhabilitetssjekken.", "error");
      throw error;
    }
  };

  const saveConflictCollectionReview = async (
    reviewedCandidateIds: string[],
    conflictIds: string[],
  ) => {
    const wasDistributed = Boolean(savedSchedule?.is_distributed);
    const revision = currentParticipant?.conflict_collection_revision;
    if (!revision) {
      notify("Kandidatlisten må lastes inn på nytt.", "error");
      throw new Error("Missing conflict collection revision");
    }
    try {
      const saved = await saveInterviewAvailability.mutateAsync({
        conflict_collection_reviewed_candidate_ids: reviewedCandidateIds,
        conflict_collection_revision: revision,
        conflicts: conflictIds,
        expected_availability_updated_at: expectedAvailabilityUpdatedAt(
          currentParticipant?.user_id,
        ),
      });
      rememberAvailabilityRevision(saved);
      await reportAutoUnpublish(wasDistributed);
    } catch (error) {
      if (isSensitiveAuthorityChangedError(error)) throw error;
      const responseStatus = (error as { response?: { status?: number } })
        .response?.status;
      notify(
        responseStatus === 409
          ? "Kandidatlisten er endret. Last inn siden på nytt."
          : "Kunne ikke lagre inhabilitetssjekken.",
        "error",
      );
      throw error;
    }
  };

  const setParticipation = async (
    participation: "awaiting_response" | "not_participating",
    userId?: string,
  ) => {
    const wasDistributed = Boolean(savedSchedule?.is_distributed);
    try {
      const saved = await saveInterviewAvailability.mutateAsync({
        user_id: userId,
        participation,
        expected_availability_updated_at: expectedAvailabilityUpdatedAt(userId),
      });
      rememberAvailabilityRevision(saved);
      if (!userId || userId === currentParticipant?.user_id) {
        setSelectedSlots(new Set());
        lastAppliedServerSlotsRef.current = "";
      }
      if (await reportAutoUnpublish(wasDistributed)) return;
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
    const wasDistributed = Boolean(savedSchedule?.is_distributed);
    try {
      const saved = await saveInterviewAvailability.mutateAsync({
        user_id: userId,
        experience_level: experienceLevel,
        expected_availability_updated_at: expectedAvailabilityUpdatedAt(userId),
      });
      rememberAvailabilityRevision(saved);
      if (await reportAutoUnpublish(wasDistributed)) return;
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
    currentParticipant,
    saveAvailability,
    saveConflictReview,
    saveConflictCollectionReview,
    setParticipation,
    setExperienceLevel,
  };
};
