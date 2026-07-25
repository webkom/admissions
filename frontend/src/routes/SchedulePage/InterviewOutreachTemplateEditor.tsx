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
  "pointer-events-none absolute inset-0 z-0 m-0 overflow-hidden rounded-lg border border-border bg-surface-base px-3 py-2 font-mono text-sm leading-relaxed text-text-primary whitespace-pre-wrap break-words";
const textareaTextClass =
  "relative z-10 box-border w-full resize-y rounded-lg border border-transparent bg-transparent px-3 py-2 font-mono text-sm leading-relaxed text-transparent caret-text-primary shadow-none focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft";

const VariablePalette: React.FC<{
  onInsert: (token: string) => void;
}> = ({ onInsert }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    <span className="mr-1 text-detail font-semibold text-text-muted">
      Sett inn:
    </span>
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
  const exampleRenderData = useMemo(() => {
    const interviewStart = new Date("2026-07-16T14:00:00+02:00");
    const timeLabel = new Intl.DateTimeFormat("nb-NO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Oslo",
    }).format(interviewStart);

    return {
      candidateFullName: "Kari Nordkvinne",
      candidateFirstName: "Kari",
      admissionTitle: "Webkomopptaket",
      timeLabel,
      committee: committeeName,
    };
  }, [committeeName]);

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
      ? "Lagrer i denne nettleseren …"
      : persistenceState === "error"
        ? "Kunne ikke lagre i denne nettleseren"
        : "Lagret i denne nettleseren";

  return (
    <details
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      className="border-b border-border-soft bg-surface-subtle px-6 py-3"
    >
      <summary
        aria-expanded={isOpen}
        className="cursor-pointer list-none rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft"
      >
        <span className="flex flex-wrap items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-semibold text-text-primary">
              Meldingsmal
            </span>
            <span className="block text-detail text-text-muted">
              SMS, {persistenceLabel}
            </span>
          </span>
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
        </span>
      </summary>

      <div className="mt-4 grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-detail font-semibold text-text-muted">SMS</span>
          <button
            type="button"
            disabled={isDefault}
            onClick={() => onChange(defaultTemplates)}
            className="inline-flex min-h-control-sm items-center gap-1.5 rounded-md border border-border-soft bg-surface-base px-3 py-1.5 text-detail font-semibold text-text-primary transition-colors hover:border-brand-strongBorder hover:text-brand focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw size={iconSizes.detail} aria-hidden="true" />
            Tilbakestill
          </button>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(28rem,1.2fr)_minmax(20rem,0.8fr)]">
          <div className="grid gap-4">
            <OutreachTemplateField
              id="interview-outreach-sms-body"
              label="SMS-tekst"
              value={value.sms.body}
              rows={7}
              onChange={(body) => onChange({ ...value, sms: { body } })}
            />

            <div
              className={cn(
                "flex items-start gap-1.5 text-detail",
                unknownTokens.length > 0 ? "text-danger" : "text-success",
              )}
            >
              {unknownTokens.length > 0 ? (
                <AlertTriangle
                  size={iconSizes.detail}
                  className="mt-0.5 flex-none"
                  aria-hidden="true"
                />
              ) : (
                <CheckCircle2
                  size={iconSizes.detail}
                  className="mt-0.5 flex-none"
                  aria-hidden="true"
                />
              )}
              <span>
                {unknownTokens.length > 0
                  ? `Ukjente variabler: ${unknownTokens.join(", ")}`
                  : "Alle variabler er gyldige"}
              </span>
            </div>
          </div>

          <section
            aria-label="Forhåndsvisning av SMS"
            className="sticky top-4 grid gap-2 rounded-xl border border-border-soft bg-surface-base p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="m-0 text-detail font-semibold text-text-primary">
                  Forhåndsvisning
                </p>
                <p className="m-0 text-tiny text-text-muted">
                  Eksempeldata, Kari Nordkvinne
                </p>
              </div>
              <span className="rounded-full bg-surface-subtle px-2 py-1 text-tiny font-semibold text-text-muted">
                SMS
              </span>
            </div>

            <div className="mx-auto w-full max-w-80 rounded-[1.5rem] border border-border-soft bg-surface-subtle p-3">
              <div className="rounded-2xl rounded-br-sm bg-brand px-3 py-2.5 text-sm leading-relaxed text-white whitespace-pre-wrap">
                {renderedSmsBody}
              </div>
              <p
                className={cn(
                  "mb-0 mt-2 text-right text-tiny font-semibold",
                  renderedSmsBody.length > 320
                    ? "text-danger"
                    : "text-text-muted",
                )}
              >
                {renderedSmsBody.length} tegn
                {renderedSmsBody.length > 320 ? ", vurder å forkorte" : ""}
              </p>
            </div>
          </section>
        </div>
      </div>
    </details>
  );
};

export default InterviewOutreachTemplateEditor;
