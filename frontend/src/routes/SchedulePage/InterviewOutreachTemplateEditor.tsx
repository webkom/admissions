import React, { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";
import {
  createDefaultInterviewOutreachTemplates,
  findUnknownInterviewOutreachTokens,
  interviewOutreachVariables,
  renderInterviewOutreachTemplate,
  type InterviewOutreachTemplates,
} from "./interviewOutreach";

// The editor's example render must match the production format so the
// preview never lies. Production uses `formatSlotLabel`, which strips the
// year ("torsdag 16. juli 14:00"). Unlike the day-tab/calendar header
// helper, the SMS template is a sentence and reads better with full day
// names rather than the abbreviated "Tor" / "Fre" form.
const FULL_WEEKDAYS_NB = [
  "Søndag",
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
];
const EXAMPLE_DATE = "2026-07-16";
const EXAMPLE_START_MINUTE = 14 * 60; // 14:00
const formatExampleTimeLabel = () => {
  const date = new Date(`${EXAMPLE_DATE}T12:00:00+02:00`);
  const weekday = FULL_WEEKDAYS_NB[date.getDay()] ?? "";
  const day = String(date.getDate());
  const month = date.toLocaleDateString("nb-NO", { month: "long" });
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${weekday} ${day}. ${month} ${pad(
    Math.floor(EXAMPLE_START_MINUTE / 60),
  )}:${pad(EXAMPLE_START_MINUTE % 60)}`;
};

const knownTokens = new Set<string>(
  interviewOutreachVariables.map(({ token }) => token),
);
const tokenPattern = /\{[^{}\r\n]+\}/g;

const renderTemplateWithTokens = (
  value: string,
): Array<string | React.ReactNode> => {
  const parts: Array<string | React.ReactNode> = [];
  let previous = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(value)) !== null) {
    if (match.index > previous) parts.push(value.slice(previous, match.index));

    const token = match[0];
    const isKnown = knownTokens.has(token);
    parts.push(
      <span
        key={`${token}-${match.index}`}
        title={isKnown ? "Gyldig variabel" : "Ukjent variabel"}
        className={cn(
          "pointer-events-auto rounded-sm border-b border-dotted px-0.5",
          isKnown ? "border-brand text-brand" : "border-danger text-danger",
        )}
      >
        {token}
      </span>,
    );
    previous = match.index + token.length;
  }

  if (previous < value.length) parts.push(value.slice(previous));
  return parts;
};

const overlayTextClass =
  "pointer-events-none absolute inset-0 z-0 m-0 overflow-hidden rounded-lg border border-border bg-surface-base px-3 py-2 font-mono text-ui leading-relaxed text-text-primary whitespace-pre-wrap break-words";
const textareaTextClass =
  "relative z-10 box-border w-full resize-y rounded-lg border border-transparent bg-transparent px-3 py-2 font-mono text-ui leading-relaxed text-transparent caret-text-primary shadow-none focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft";

const VariablePalette: React.FC<{
  onInsert: (token: string) => void;
}> = ({ onInsert }) => (
  <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center">
    <span className="text-detail font-semibold text-text-muted">Sett inn:</span>
    <div className="flex flex-wrap items-center gap-1.5">
      {interviewOutreachVariables.map((variable) => (
        <button
          key={variable.token}
          type="button"
          title={`${variable.description}, setter inn ${variable.token}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onInsert(variable.token)}
          className="inline-flex min-h-control-sm items-center rounded-full border border-border-soft bg-surface-base px-2.5 py-1 text-detail font-semibold text-text-primary transition-colors hover:border-brand-strongBorder hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
        >
          + {variable.label}
        </button>
      ))}
    </div>
  </div>
);

const OutreachTemplateField: React.FC<{
  id: string;
  label: string;
  value: string;
  rows: number;
  onChange: (nextValue: string) => void;
}> = ({ id, label, value, rows, onChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLPreElement>(null);

  const syncScroll = () => {
    if (!textareaRef.current || !backdropRef.current) return;
    backdropRef.current.scrollTop = textareaRef.current.scrollTop;
    backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
  };

  const insertVariable = (token: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    onChange(`${value.slice(0, start)}${token}${value.slice(end)}`);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      const cursor = start + token.length;
      textarea?.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <div className="grid gap-2">
      <label
        htmlFor={id}
        className="text-detail font-semibold text-text-primary"
      >
        {label}
      </label>
      <VariablePalette onInsert={insertVariable} />
      <div className="relative">
        <pre ref={backdropRef} aria-hidden="true" className={overlayTextClass}>
          {renderTemplateWithTokens(value)}
        </pre>
        <textarea
          ref={textareaRef}
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onScroll={syncScroll}
          rows={rows}
          spellCheck={false}
          className={textareaTextClass}
        />
      </div>
    </div>
  );
};

const InterviewOutreachTemplateEditor: React.FC<{
  value: InterviewOutreachTemplates;
  onChange: (value: InterviewOutreachTemplates) => void;
  persistenceState: "saving" | "saved" | "error";
  committeeName: string;
}> = ({ value, onChange, persistenceState, committeeName }) => {
  const [isOpen, setIsOpen] = useState(false);
  const defaultTemplates = useMemo(
    () => createDefaultInterviewOutreachTemplates(committeeName),
    [committeeName],
  );
  const exampleRenderData = useMemo(
    () => ({
      candidateFullName: "Kari Nordkvinne",
      candidateFirstName: "Kari",
      admissionTitle: "Webkomopptaket",
      timeLabel: formatExampleTimeLabel(),
      committee: committeeName,
    }),
    [committeeName],
  );

  const renderedSmsBody = useMemo(
    () =>
      renderInterviewOutreachTemplate(value.sms.body, {
        ...exampleRenderData,
      }),
    [exampleRenderData, value.sms.body],
  );
  const unknownTokens = findUnknownInterviewOutreachTokens(value.sms.body);
  const isDefault = JSON.stringify(value) === JSON.stringify(defaultTemplates);
  const persistenceLabel =
    persistenceState === "saving"
      ? "Lagrer for komiteen …"
      : persistenceState === "error"
        ? "Kunne ikke lagre for komiteen"
        : "Felles mal for komiteen";

  return (
    <details
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      className="border-b border-border-soft bg-surface-subtle"
    >
      <summary
        aria-expanded={isOpen}
        className="cursor-pointer list-none px-6 py-3 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-ui font-semibold text-text-primary">
              Meldingsmal
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-detail font-semibold",
                persistenceState === "error"
                  ? "text-danger"
                  : persistenceState === "saving"
                    ? "text-text-muted"
                    : "text-text-faded",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  persistenceState === "error"
                    ? "bg-danger"
                    : persistenceState === "saving"
                      ? "bg-text-muted"
                      : "bg-success",
                )}
              />
              {persistenceLabel}
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-detail font-semibold text-brand">
            {isOpen ? "Lukk" : "Rediger"}
            <ChevronDown
              size={iconSizes.detail}
              aria-hidden="true"
              className={cn(
                "transition-transform duration-150",
                isOpen && "rotate-180",
              )}
            />
          </span>
        </div>
      </summary>

      <div className="grid gap-6 border-t border-border-soft bg-surface-base px-6 py-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-3">
          <OutreachTemplateField
            id="interview-outreach-sms-body"
            label=""
            value={value.sms.body}
            rows={7}
            onChange={(body) => onChange({ ...value, sms: { body } })}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              className={cn(
                "flex items-center gap-1.5 text-detail",
                unknownTokens.length > 0 ? "text-danger" : "text-success",
              )}
            >
              {unknownTokens.length > 0 ? (
                <AlertTriangle
                  size={iconSizes.detail}
                  className="flex-none"
                  aria-hidden="true"
                />
              ) : (
                <CheckCircle2
                  size={iconSizes.detail}
                  className="flex-none"
                  aria-hidden="true"
                />
              )}
              <span>
                {unknownTokens.length > 0
                  ? `Ukjente variabler: ${unknownTokens.join(", ")}`
                  : "Alle variabler er gyldige"}
              </span>
            </div>
            <button
              type="button"
              disabled={isDefault}
              onClick={() => onChange(defaultTemplates)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-soft bg-surface-base px-2.5 py-1 text-detail font-semibold text-text-primary transition-colors hover:border-brand-strongBorder hover:text-brand focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw size={iconSizes.detail} aria-hidden="true" />
              Tilbakestill
            </button>
          </div>
        </div>

        <div
          aria-label="Forhåndsvisning av SMS"
          className="flex flex-col items-stretch self-start pt-9 lg:pt-[60px]"
        >
          <div className="rounded-2xl rounded-bl-sm bg-brand px-4 py-3 text-ui leading-relaxed text-white whitespace-pre-wrap">
            {renderedSmsBody}
          </div>
        </div>
      </div>
    </details>
  );
};

export default InterviewOutreachTemplateEditor;
