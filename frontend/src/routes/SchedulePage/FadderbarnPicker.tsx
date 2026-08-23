import React from "react";
import { Search, X } from "lucide-react";
import { Chip } from "src/components/ui";
import { useMemberSearch, type DirectoryMember } from "src/query/hooks";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";
import useDebouncedState from "src/utils/useDebouncedState";

export interface Fadderbarn {
  lego_user_id: number;
  username?: string;
  full_name?: string;
}

interface FadderbarnPickerProps {
  admissionSlug: string;
  value: Fadderbarn[];
  onChange: (next: Fadderbarn[]) => void;
  disabled?: boolean;
}

const displayName = (member: Fadderbarn) =>
  member.full_name || member.username || `#${member.lego_user_id}`;

const FadderbarnPicker: React.FC<FadderbarnPickerProps> = ({
  admissionSlug,
  value,
  onChange,
  disabled = false,
}) => {
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebouncedState(query);
  const {
    data: results,
    isFetching,
    error,
  } = useMemberSearch(admissionSlug, debouncedQuery);

  const chosenIds = new Set(value.map((member) => member.lego_user_id));
  const suggestions = (results ?? []).filter(
    (member) => !chosenIds.has(member.lego_user_id),
  );

  const add = (member: DirectoryMember) => {
    onChange([
      ...value,
      {
        lego_user_id: member.lego_user_id,
        username: member.username,
        full_name: member.full_name,
      },
    ]);
    setQuery("");
  };

  const remove = (legoUserId: number) =>
    onChange(value.filter((member) => member.lego_user_id !== legoUserId));

  const status = error?.response?.status;
  const searchError =
    status === 409
      ? "Innloggingen mot Abakus har utløpt. Last siden på nytt og logg inn igjen."
      : status === 503
        ? "Søk er utilgjengelig akkurat nå. Prøv igjen om litt."
        : status
          ? "Kunne ikke søke akkurat nå."
          : "";

  return (
    <section
      aria-label="Fadderbarn"
      data-cy="fadderbarn-picker"
      className="flex flex-col gap-2"
    >
      <div>
        <p className="m-0 text-ui font-semibold text-text-primary">
          Har du fadderbarn?
        </p>
        <p className="m-0 mt-0.5 text-detail text-text-muted">
          Legg dem til her, så slipper du å bli satt opp til å intervjue dem
          (det gjør det lettere med inhabilitet). Vi sier aldri fra om noen av
          dem faktisk har søkt.
        </p>
      </div>

      {value.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {value.map((member) => (
            <li key={member.lego_user_id}>
              <Chip tone="brand">
                {displayName(member)}
                <button
                  type="button"
                  onClick={() => remove(member.lego_user_id)}
                  disabled={disabled}
                  aria-label={`Fjern ${displayName(member)}`}
                  className={cn("ml-0.5 opacity-70 hover:opacity-100")}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </Chip>
            </li>
          ))}
        </ul>
      )}

      <div className="relative max-w-sm">
        <label htmlFor="fadderbarn-search" className="sr-only">
          Søk etter fadderbarn
        </label>

        {/* Focus ring applied to the wrapper container */}
        <div className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface-base px-2.5 py-1.5 transition-colors focus-within:border-brand-border focus-within:ring-2 focus-within:ring-brand-ring">
          <Search
            size={iconSizes.control}
            aria-hidden="true"
            className="flex-none text-text-muted"
          />
          <input
            id="fadderbarn-search"
            type="search"
            value={query}
            disabled={disabled}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Søk etter navn i Abakus…"
            data-cy="fadderbarn-search"
            className="w-full bg-transparent text-ui outline-none placeholder:text-text-disabled"
          />
        </div>

        {searchError && (
          <p
            role="alert"
            data-cy="fadderbarn-search-error"
            className="m-0 mt-1 text-detail font-semibold text-danger"
          >
            {searchError}
          </p>
        )}

        {/* Results menu positioned absolutely over surrounding layout */}
        {!searchError && debouncedQuery.trim().length >= 2 && (
          <ul
            data-cy="fadderbarn-results"
            className="absolute left-0 top-full z-30 m-0 mt-1 flex max-h-60 w-full list-none flex-col gap-0.5 overflow-y-auto rounded-lg border border-border-soft bg-surface-base p-1 shadow-lg"
          >
            {isFetching && suggestions.length === 0 && (
              <li className="px-2 py-1.5 text-detail text-text-muted">
                Søker…
              </li>
            )}
            {!isFetching && suggestions.length === 0 && (
              <li className="px-2 py-1.5 text-detail text-text-muted">
                Ingen treff.
              </li>
            )}
            {suggestions.map((member) => (
              <li key={member.lego_user_id}>
                <button
                  type="button"
                  onClick={() => add(member)}
                  disabled={disabled}
                  data-cy={`fadderbarn-result-${member.lego_user_id}`}
                  className="w-full rounded-md px-2 py-1.5 text-left text-ui transition-colors hover:bg-surface-subtle focus:bg-surface-subtle focus:outline-none"
                >
                  {member.full_name || member.username}
                  {member.full_name && member.username && (
                    <span className="ml-1.5 text-detail text-text-muted">
                      ({member.username})
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default FadderbarnPicker;
