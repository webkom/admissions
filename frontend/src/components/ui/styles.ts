export const sectionLabelClass =
  "mb-2 block text-ui font-semibold text-text-muted";

export const keyboardFocusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring";

export const actionButtonBase = `inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-ui font-semibold transition-[border-color,background,color,box-shadow] duration-100 ${keyboardFocusRingClass} disabled:cursor-not-allowed disabled:opacity-50`;

export const actionButtonPrimary =
  "border-brand bg-brand font-semibold text-white hover:border-brand-hover hover:bg-brand-hover active:bg-brand-pressed";

export const actionButtonNeutral =
  "border-border bg-surface-subtle text-text-primary hover:bg-surface-neutral";

export const actionButtonGhost =
  "border-transparent bg-transparent text-text-muted shadow-none hover:border-border hover:bg-surface-subtle hover:text-text-primary";

export const actionButtonActive =
  "border-brand bg-brand text-white hover:border-brand-hover hover:bg-brand-hover active:bg-brand-pressed active:border-brand-pressed";

export const actionButtonDanger =
  "border-danger-border bg-danger-bg text-danger hover:border-danger hover:bg-danger hover:text-white font-bold";
