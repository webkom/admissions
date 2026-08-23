import { createContext, useContext } from "react";

/**
 * Whether the local application draft may be written to right now.
 *
 * The autosave writers each fire once on mount, with whatever Formik was
 * initialised with. While the "Du har ulagrede endringer" banner is still
 * unanswered that is the *submitted* server data, not the draft - so those
 * mount-time writes overwrote the very draft the banner was offering to
 * restore, and "Gjenopprett" then read back the values it had just been
 * clobbered with.
 *
 * Writes stay closed for as long as that choice is outstanding. With no
 * pending draft there is nothing to protect, so the default is open and
 * ordinary typing saves as before.
 */
const DraftWriteGateContext = createContext(true);

export const DraftWriteGateProvider = DraftWriteGateContext.Provider;

export const useDraftWritesAllowed = () => useContext(DraftWriteGateContext);
