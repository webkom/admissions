import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Users } from "lucide-react";
import cn from "src/utils/cn";
import { iconSizes } from "src/styles/designTokens";
import { keyboardFocusRingClass } from "src/components/Scheduling/ui";
import type { Group } from "src/types";

interface CommitteePickerProps {
  admissionSlug: string;
  admissionTitle: string;
  committees: Pick<Group, "pk" | "name">[];
}

/** Scheduling is committee-scoped, so a user who reaches more than one
 * committee's interviews (a full admission admin, or someone who represents
 * several committees at once) has to say which one before anything loads -
 * there is no longer a single shared schedule to fall back to. */
const CommitteePicker: React.FC<CommitteePickerProps> = ({
  admissionSlug,
  admissionTitle,
  committees,
}) => {
  const sortedCommittees = [...committees].sort((a, b) =>
    a.name.localeCompare(b.name, "nb"),
  );

  return (
    <div className="mx-auto w-full max-w-page px-5 pb-20 pt-8 handheld:px-4">
      <header className="mb-8 border-b border-border-soft pb-5">
        <h1 className="m-0 text-display-sm font-semibold text-text-primary">
          {admissionTitle}
        </h1>
        <p className="m-0 mt-2 text-ui text-text-muted">
          Velg hvilken komité du vil planlegge intervjuer for.
        </p>
      </header>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {sortedCommittees.length === 0 && (
          <li className="rounded-panel border border-border bg-surface-base px-5 py-4 text-ui text-text-muted">
            Du har ingen komiteer å planlegge intervjuer for i dette opptaket.
          </li>
        )}
        {sortedCommittees.map((committee) => (
          <li key={committee.pk}>
            <Link
              to={`/${admissionSlug}/schedule/${committee.pk}`}
              className={cn(
                "flex items-center justify-between gap-4 rounded-panel border border-border bg-surface-base px-5 py-4 text-ui font-semibold text-text-primary shadow-sm transition-colors hover:bg-surface-subtle",
                keyboardFocusRingClass,
              )}
            >
              <span className="flex items-center gap-3">
                <Users
                  size={iconSizes.medium}
                  className="text-brand"
                  aria-hidden="true"
                />
                {committee.name}
              </span>
              <ArrowRight size={iconSizes.small} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CommitteePicker;
