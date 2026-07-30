import type { QueryClient } from "@tanstack/react-query";
import type { MouseEvent } from "react";
import { clearApplicationDraftNamespace } from "src/utils/draftHelper";

import { clearAllSensitiveDataForActorChange } from "./sensitiveAccess";

export const SENSITIVE_ACTOR_STORAGE_KEY = "admissions.auth.actor.v1";

interface SensitiveActorState {
  actorId: string | null;
}

const serializeActorState = (actorId: string | null) =>
  JSON.stringify({ actorId } satisfies SensitiveActorState);

const parseSensitiveActorState = (
  value: string | null,
): SensitiveActorState | null => {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SensitiveActorState>;
    if (parsed.actorId === null || typeof parsed.actorId === "string") {
      return { actorId: parsed.actorId };
    }
  } catch {
    return null;
  }
  return null;
};

type ActorStorage = Pick<Storage, "getItem" | "setItem">;

export const publishSensitiveActorIdentity = (
  actorId: string | null,
  storage?: ActorStorage,
) => {
  try {
    const actorStorage = storage ?? window.localStorage;
    const serialized = serializeActorState(actorId);
    if (actorStorage.getItem(SENSITIVE_ACTOR_STORAGE_KEY) !== serialized) {
      actorStorage.setItem(SENSITIVE_ACTOR_STORAGE_KEY, serialized);
    }
  } catch {
    // Storage can be unavailable in hardened/private browser contexts. The
    // server-confirmed actor scope still protects this tab.
  }
};

/** Invalidate this tab and notify every other tab after logout is confirmed. */
const prepareSensitiveLogout = (
  queryClient: QueryClient,
  storage?: ActorStorage,
) => {
  clearAllSensitiveDataForActorChange(queryClient);
  publishSensitiveActorIdentity(null, storage);
};

interface SensitiveLogoutOptions {
  request?: () => Promise<{ ok: boolean }>;
  navigate?: (path: string) => void;
  storage?: ActorStorage;
}

/**
 * Confirm that Django invalidated the shared session cookie before announcing
 * logout. Otherwise another tab could react to the storage event, reload, and
 * refetch with the still-valid old session.
 */
export const completeSensitiveLogout = async (
  queryClient: QueryClient,
  {
    request = () =>
      window.fetch("/logout/", {
        credentials: "same-origin",
        redirect: "follow",
      }),
    navigate = (path) => window.location.assign(path),
    storage,
  }: SensitiveLogoutOptions = {},
) => {
  try {
    const response = await request();
    if (!response.ok) throw new Error("Logout request failed");
  } catch {
    navigate("/logout/");
    return false;
  }

  prepareSensitiveLogout(queryClient, storage);
  navigate("/");
  return true;
};

/** Keep modified link clicks native; own ordinary logout clicks end to end. */
export const handleSensitiveLogoutLink = (
  queryClient: QueryClient,
  event: MouseEvent<HTMLAnchorElement>,
) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  clearApplicationDraftNamespace();
  void completeSensitiveLogout(queryClient);
};

/**
 * Session cookies are shared by tabs, while React Query caches are not.
 * Announce the server-rendered actor identity and synchronously purge this
 * tab before reloading whenever another tab announces a different actor.
 */
export const installSensitiveActorSynchronization = (
  queryClient: QueryClient,
  actorId: string | null,
  reload: () => void = () => window.location.reload(),
  storage?: ActorStorage,
) => {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== SENSITIVE_ACTOR_STORAGE_KEY) return;
    const nextState = parseSensitiveActorState(event.newValue);
    if (!nextState || nextState.actorId === actorId) return;

    clearAllSensitiveDataForActorChange(queryClient);
    reload();
  };

  window.addEventListener("storage", handleStorage);
  publishSensitiveActorIdentity(actorId, storage);
  return () => window.removeEventListener("storage", handleStorage);
};
