import { useEffect } from "react";
import { useFormikContext } from "formik";
import type { FormValues } from ".";
import { saveGroupAnswersDraft } from "src/utils/draftHelper";
import useDebouncedState from "src/utils/useDebouncedState";
import { useDraftWritesAllowed } from "src/utils/draftWriteGate";

/**
 * Persists the per-committee answers to the local draft.
 *
 * The committee texts and the priority text already debounce-save themselves
 * from their own fields; the answers had no equivalent, so they were the one
 * part of a half-written application that a reload always destroyed.
 */
const DraftAnswersAutosave: React.FC = () => {
  const { values } = useFormikContext<FormValues>();
  const serialized = JSON.stringify(values.groupAnswers ?? {});
  const debounced = useDebouncedState(serialized);

  const draftWritesAllowed = useDraftWritesAllowed();

  useEffect(() => {
    if (!draftWritesAllowed || !debounced) return;
    try {
      saveGroupAnswersDraft(JSON.parse(debounced));
    } catch {
      // A malformed snapshot is not worth losing the rest of the draft over.
    }
  }, [draftWritesAllowed, debounced]);

  return null;
};

export default DraftAnswersAutosave;
