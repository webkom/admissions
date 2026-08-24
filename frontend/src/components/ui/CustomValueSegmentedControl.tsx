import React from "react";
import { Check } from "lucide-react";
import { iconSizes, iconStrokeWidths } from "src/styles/designTokens";

interface CustomValueSegmentedControlProps {
  label: string;
  presets: readonly number[];
  value: number;
  isCustom: boolean;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  formatValue?: (value: number) => string;
  onSelectPreset: (value: number) => void;
  onCommitCustomValue: (value: number) => void;
  /** Stretch to the available width instead of sizing to the options. */
  fullWidth?: boolean;
}

/**
 * Shared compact radio control laying numeric presets and the custom option out
 * on a single row. Its value is controlled by the caller; only the transient
 * editor state is local.
 */
export const CustomValueSegmentedControl: React.FC<
  CustomValueSegmentedControlProps
> = ({
  label,
  presets,
  value,
  isCustom,
  min,
  max,
  step,
  disabled = false,
  formatValue = (next) => `${next} min`,
  onSelectPreset,
  onCommitCustomValue,
  fullWidth = false,
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftValue, setDraftValue] = React.useState("");
  const [showDraftError, setShowDraftError] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const confirmButtonRef = React.useRef<HTMLButtonElement>(null);
  const radioRefs = React.useRef<Array<HTMLInputElement | null>>([]);
  const editFinishedRef = React.useRef(false);
  const inputId = React.useId();
  const uniquePresets = Array.from(new Set(presets));
  const hasCustomValue = isCustom && !uniquePresets.includes(value);
  const parsedDraft = Number(draftValue);
  const isDraftValid =
    draftValue.trim() !== "" &&
    Number.isInteger(parsedDraft) &&
    parsedDraft >= min &&
    parsedDraft <= max &&
    (parsedDraft - min) % step === 0;

  React.useEffect(() => {
    if (!isEditing) return;
    // Focused and selected synchronously, not inside a requestAnimationFrame:
    // this effect already runs after React has committed the editor, so the
    // input is attached and there is nothing to wait a frame for. Deferring
    // it meant that on a slow or loaded machine the select() could land
    // *after* the user had begun typing, so their next keystroke replaced
    // the selected digits instead of appending - typing "45" quickly ended
    // up committing "5".
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  const openEditor = () => {
    if (disabled || isEditing) return;
    editFinishedRef.current = false;
    setDraftValue(String(value));
    setShowDraftError(false);
    setIsEditing(true);
  };

  const commit = () => {
    if (editFinishedRef.current) return true;
    if (!isDraftValid) {
      setShowDraftError(true);
      return false;
    }
    editFinishedRef.current = true;
    if (uniquePresets.includes(parsedDraft)) {
      onSelectPreset(parsedDraft);
    } else {
      onCommitCustomValue(parsedDraft);
    }
    setIsEditing(false);
    setShowDraftError(false);
    return true;
  };

  const moveRadioFocus = (
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const total = uniquePresets.length + 1;
    const nextIndex =
      (index + (event.key === "ArrowRight" ? 1 : -1) + total) % total;
    if (nextIndex === uniquePresets.length) {
      openEditor();
      return;
    }
    onSelectPreset(uniquePresets[nextIndex]);
    radioRefs.current[nextIndex]?.focus();
  };

  const groupName = `${inputId}-options`;
  const customChecked = isCustom || isEditing;

  return (
    <div className={fullWidth ? "w-full" : "w-full max-w-none tablet:w-auto"}>
      <div
        role="radiogroup"
        aria-label={label}
        className="w-full rounded-md border border-border-soft bg-surface-muted p-1"
      >
        <div
          className="grid w-full gap-1"
          style={{
            // Presets share the row with the custom option, which gets a wider
            // track because its label is a word rather than a number.
            gridTemplateColumns: `repeat(${uniquePresets.length}, minmax(0, 1fr)) minmax(0, 1.6fr)`,
          }}
        >
          {uniquePresets.map((preset, index) => {
            const checked = !isCustom && !isEditing && value === preset;
            return (
              <label
                key={preset}
                className="relative flex min-h-9 min-w-0 cursor-pointer items-center justify-center rounded px-2 py-1.5 text-detail font-semibold text-text-muted has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-focus has-[:checked]:bg-surface-base has-[:checked]:text-text-primary has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
              >
                <input
                  ref={(input) => {
                    radioRefs.current[index] = input;
                  }}
                  type="radio"
                  name={groupName}
                  value={preset}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => {
                    onSelectPreset(preset);
                    setIsEditing(false);
                  }}
                  onKeyDown={(event) => moveRadioFocus(event, index)}
                  className="sr-only"
                />
                {formatValue(preset)}
              </label>
            );
          })}

          <div className="relative min-h-9 min-w-0">
            <label
              className={`relative flex h-full min-w-0 cursor-pointer items-center justify-center rounded px-2 py-1.5 text-detail font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-focus has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${
                customChecked
                  ? "bg-surface-base text-text-primary"
                  : "bg-transparent text-text-muted"
              }`}
              onClick={openEditor}
            >
              <input
                ref={(input) => {
                  radioRefs.current[uniquePresets.length] = input;
                }}
                type="radio"
                name={groupName}
                value="custom"
                checked={customChecked}
                disabled={disabled}
                onChange={openEditor}
                onKeyDown={(event) =>
                  moveRadioFocus(event, uniquePresets.length)
                }
                className="sr-only"
              />
              <span
                className={`flex h-5 min-w-0 items-center justify-center transition-opacity duration-150 ${
                  isEditing ? "opacity-90" : "opacity-100"
                }`}
              >
                {isEditing ? (
                  <span className="flex h-5 min-w-0 items-center justify-center gap-1">
                    <input
                      ref={inputRef}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={draftValue}
                      aria-label={`${label} i minutter`}
                      aria-invalid={showDraftError}
                      aria-describedby={
                        showDraftError ? `${inputId}-help` : undefined
                      }
                      className="w-8 border-none border-b border-border-muted bg-transparent p-0 text-right text-detail font-semibold tabular-nums text-text-primary [-moz-appearance:textfield] focus:border-brand focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        setDraftValue(event.target.value);
                        setShowDraftError(false);
                      }}
                      onBlur={(event) => {
                        if (event.relatedTarget === confirmButtonRef.current) {
                          return;
                        }
                        commit();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commit();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          editFinishedRef.current = true;
                          setIsEditing(false);
                          setShowDraftError(false);
                        }
                      }}
                    />
                    <span>min</span>
                  </span>
                ) : hasCustomValue ? (
                  `Egendefinert, ${formatValue(value)}`
                ) : (
                  "Egendefinert"
                )}
              </span>
            </label>

            <button
              ref={confirmButtonRef}
              type="button"
              aria-label={`Bekreft egendefinert ${label.toLowerCase()}`}
              aria-hidden={!isEditing}
              tabIndex={isEditing ? 0 : -1}
              disabled={disabled || !isEditing || !isDraftValid}
              className={`absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded border border-border-soft bg-surface-base text-text-primary shadow-sm transition-[background-color,border-color,opacity,transform] duration-200 ease-out hover:border-brand-strongBorder hover:bg-surface-subtle active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus disabled:cursor-not-allowed ${
                isEditing
                  ? isDraftValid
                    ? "pointer-events-auto scale-100 opacity-100"
                    : "pointer-events-auto scale-100 opacity-40"
                  : "pointer-events-none scale-90 opacity-0"
              }`}
              onClick={commit}
            >
              <Check
                size={iconSizes.medium}
                strokeWidth={iconStrokeWidths.standard}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </div>
      {showDraftError && (
        <p
          id={`${inputId}-help`}
          className="m-0 mt-1 text-detail font-semibold text-danger"
          aria-live="polite"
        >
          Skriv inn et helt antall fra {min} til {max}
          {step > 1 ? ` i steg på ${step}` : ""}.
        </p>
      )}
    </div>
  );
};
