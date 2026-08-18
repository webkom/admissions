import React from "react";
import type { AxiosError } from "axios";
import { LogIn, RefreshCw } from "lucide-react";
import { getApiErrorMessage } from "src/utils/apiErrors";
import cn from "src/utils/cn";

interface SessionExpiredNoticeProps {
  error: AxiosError;
}

const buttonBase =
  "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-detail font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus";

/**
 * Replaces a bare `Error: {message}` for the applicant portal.
 *
 * An expired session used to render an unstyled string with no way forward, and
 * because writes stay latched off for the rest of the tab, clicking submit again
 * did nothing. The two things an applicant needs here are that their text is
 * safe and how to get back in.
 */
const SessionExpiredNotice: React.FC<SessionExpiredNoticeProps> = ({
  error,
}) => {
  const status = error.response?.status ?? 0;
  const sessionExpired = status === 401;

  return (
    <div className="mx-auto w-full max-w-prose px-5 py-10">
      <div
        role="alert"
        data-cy="portal-error-notice"
        className="flex flex-col gap-3 rounded-xl border border-border bg-surface-base px-5 py-4"
      >
        <h1 className="m-0 text-lego font-bold text-text-primary">
          {sessionExpired ? "Innloggingen har utløpt" : "Noe gikk galt"}
        </h1>
        <p className="m-0 text-ui text-text-body">
          {getApiErrorMessage(error, "Kunne ikke hente opptaket.")}
        </p>
        {sessionExpired && (
          <p className="m-0 text-ui font-semibold text-success">
            Det du har skrevet er lagret i nettleseren, og hentes fram igjen når
            du er logget inn.
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {sessionExpired && (
            <a
              href="/login/lego/"
              data-cy="portal-error-login"
              className={cn(buttonBase, "bg-brand text-white hover:opacity-90")}
            >
              <LogIn size={14} aria-hidden="true" />
              Logg inn på nytt
            </a>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            data-cy="portal-error-reload"
            className={cn(
              buttonBase,
              "border border-border text-text-primary hover:bg-surface-subtle",
            )}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Last siden på nytt
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionExpiredNotice;
