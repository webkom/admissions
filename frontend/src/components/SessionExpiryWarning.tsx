import React from "react";
import { DateTime } from "luxon";
import { LogIn } from "lucide-react";
import { useLocation } from "react-router-dom";
import config from "src/utils/config";
import { isLoggedIn } from "src/utils/djangoData";
import cn from "src/utils/cn";

const WARN_BEFORE_MINUTES = 5;

/**
 * Warns before the session expires, rather than letting the applicant discover
 * it when a submit fails.
 *
 * Deliberately never redirects: navigating away would discard whatever is in
 * the form. The link opens login in a new tab so the current page survives.
 */
const SessionExpiryWarning: React.FC = () => {
  const expiresAt = config.SESSION_EXPIRES_AT;
  const [minutesLeft, setMinutesLeft] = React.useState<number | null>(null);
  const { pathname } = useLocation();
  // Only the applicant form autosaves. This banner renders portal-wide, so on
  // /admin and /schedule the reassurance was simply untrue - those routes keep
  // nothing in the browser, and telling a recruiter mid-edit that their work is
  // safe is worse than saying nothing.
  const draftsAreKeptHere = !/\/(admin|schedule)(\/|$)/.test(pathname);

  React.useEffect(() => {
    if (!expiresAt || !isLoggedIn()) return;
    const expiry = DateTime.fromISO(expiresAt);
    if (!expiry.isValid) return;

    const tick = () => {
      const remaining = expiry.diffNow("minutes").minutes;
      setMinutesLeft(remaining > 0 ? Math.ceil(remaining) : 0);
    };
    tick();
    const timer = window.setInterval(tick, 30000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  if (minutesLeft === null || minutesLeft > WARN_BEFORE_MINUTES) return null;

  return (
    <div
      role="status"
      data-cy="session-expiry-warning"
      className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2"
    >
      <p className="m-0 text-detail font-semibold text-amber-900">
        {`${
          minutesLeft > 0
            ? `Innloggingen utløper om ${minutesLeft} min.`
            : "Innloggingen har utløpt."
        }${draftsAreKeptHere ? " Det du skriver er lagret i nettleseren." : ""}`}
      </p>
      <a
        href="/login/lego/"
        target="_blank"
        rel="noreferrer"
        data-cy="session-expiry-login"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1",
          "text-detail font-bold text-amber-900 hover:bg-amber-50",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900",
        )}
      >
        <LogIn size={14} aria-hidden="true" />
        Forleng innlogging
      </a>
    </div>
  );
};

export default SessionExpiryWarning;
