import { QueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";

import {
  blockSensitiveAdmissionCacheWrites,
  buildSensitiveAdmissionScopeKey,
  clearSensitiveAdmissionDataForScopeChange,
  isSensitiveAuthorityChangedError,
  resetAdminApplicationQueriesAfterNotFound,
  restoreSensitiveAccessAfterVerifiedAdmission,
  runSensitiveAdmissionMutation,
} from "../../frontend/src/query/sensitiveAccess";
import {
  completeSensitiveLogout,
  installSensitiveActorSynchronization,
  publishSensitiveActorIdentity,
  SENSITIVE_ACTOR_STORAGE_KEY,
} from "../../frontend/src/query/sensitiveActorSync";
import type { Admission } from "../../frontend/src/types";

describe("sensitive admission cache scope", () => {
  it("changes when scheduling privileges or represented groups change", () => {
    const adminScope = buildSensitiveAdmissionScopeKey({
      actorId: "actor-a",
      isAdmin: true,
      committeeRole: "leader",
      representedGroups: ["Webkom"],
      committeeGroups: ["Webkom"],
      applicationViewMode: "admin_full",
    });
    const memberScope = buildSensitiveAdmissionScopeKey({
      actorId: "actor-a",
      isAdmin: false,
      committeeRole: "member",
      representedGroups: [],
      committeeGroups: ["Webkom"],
      applicationViewMode: "none",
    });

    expect(memberScope).not.to.equal(adminScope);
  });

  it("changes when the authenticated actor changes but roles stay identical", () => {
    const scopeFor = (actorId: string) =>
      buildSensitiveAdmissionScopeKey({
        actorId,
        isAdmin: false,
        committeeRole: "member",
        representedGroups: [],
        committeeGroups: ["Webkom"],
        applicationViewMode: "none",
      });

    expect(scopeFor("actor-b")).not.to.equal(scopeFor("actor-a"));
  });

  it("changes when the server narrows application disclosure", () => {
    const scopeFor = (
      applicationViewMode: Admission["userdata"]["application_view_mode"],
    ) =>
      buildSensitiveAdmissionScopeKey({
        actorId: "actor-a",
        isAdmin: true,
        committeeRole: "recruiting",
        representedGroups: ["Webkom"],
        committeeGroups: ["Webkom"],
        applicationViewMode,
      });

    expect(scopeFor("committee_minimal")).not.to.equal(scopeFor("admin_full"));
  });

  it("clears every scoped application cache variant after a concurrent 404", () => {
    const queryClient = new QueryClient();
    const slug = "webkom-open";
    const path = `/admin/admission/${slug}/application/`;
    const adminKey = [path, '["admin_full"]'];
    const committeeKey = [path, '["committee_minimal","Webkom"]'];
    const otherAdmissionKey = [
      "/admin/admission/other-admission/application/",
      '["admin_full"]',
    ];

    queryClient.setQueryData(adminKey, [{ pk: "private-admin-row" }]);
    queryClient.setQueryData(committeeKey, [{ pk: "private-committee-row" }]);
    queryClient.setQueryData(otherAdmissionKey, [{ pk: "other-row" }]);

    return resetAdminApplicationQueriesAfterNotFound(queryClient, slug).then(
      () => {
        expect(queryClient.getQueryData(adminKey)).to.equal(undefined);
        expect(queryClient.getQueryData(committeeKey)).to.equal(undefined);
        expect(queryClient.getQueryData(otherAdmissionKey)).to.deep.equal([
          { pk: "other-row" },
        ]);
      },
    );
  });

  it("drops downstream admission data without dropping the fresh role descriptor", () => {
    const queryClient = new QueryClient();
    const slug = "webkom-open";
    const admissionKey = [`/admission/${slug}/`];
    const scheduleKey = [`/admin/admission/${slug}/schedule/`];
    const candidatesKey = [`/admin/admission/${slug}/candidates/`];
    const availabilityKey = [`/admin/admission/${slug}/availability/`];
    const myApplicationKey = [`/admission/${slug}/application/mine/`];
    const otherAdmissionKey = ["/admin/admission/other-admission/schedule/"];

    queryClient.setQueryData(admissionKey, { userdata: { is_admin: false } });
    queryClient.setQueryData(scheduleKey, { schedule: ["private-row"] });
    queryClient.setQueryData(candidatesKey, [{ id: "private-candidate" }]);
    queryClient.setQueryData(availabilityKey, [
      { proposed_candidate_ids: ["private-candidate"] },
    ]);
    queryClient.setQueryData(myApplicationKey, {
      phone_number: "private-phone",
    });
    queryClient.setQueryData(otherAdmissionKey, { schedule: ["other-row"] });

    clearSensitiveAdmissionDataForScopeChange(queryClient, slug);

    expect(queryClient.getQueryData(admissionKey)).to.deep.equal({
      userdata: { is_admin: false },
    });
    expect(queryClient.getQueryData(scheduleKey)).to.equal(undefined);
    expect(queryClient.getQueryData(candidatesKey)).to.equal(undefined);
    expect(queryClient.getQueryData(availabilityKey)).to.equal(undefined);
    expect(queryClient.getQueryData(myApplicationKey)).to.equal(undefined);
    expect(queryClient.getQueryData(otherAdmissionKey)).to.deep.equal({
      schedule: ["other-row"],
    });
  });

  it("rejects a delayed sensitive response after scope purge and recovery", () => {
    const queryClient = new QueryClient();
    const slug = "webkom-open";
    let releaseOldRequest: ((value: string) => void) | undefined;
    const oldRequest = runSensitiveAdmissionMutation(
      slug,
      () =>
        new Promise<string>((resolve) => {
          releaseOldRequest = resolve;
        }),
    ).then(
      (value) => ({ kind: "success" as const, value }),
      (error: unknown) => ({ kind: "error" as const, error }),
    );

    clearSensitiveAdmissionDataForScopeChange(queryClient, slug);
    blockSensitiveAdmissionCacheWrites(slug, new AxiosError("Access removed"));
    const restored = restoreSensitiveAccessAfterVerifiedAdmission(
      queryClient,
      slug,
      {
        slug,
        userdata: {
          actor_id: "actor-b",
          is_admin: false,
          is_privileged: true,
          is_recruiter: true,
          committee_role: "recruiting",
          committee_groups: ["Webkom"],
          represented_groups: ["Webkom"],
          has_application: false,
        },
      } as Admission,
    );

    expect(restored).to.equal(true);
    releaseOldRequest?.("private-old-response");

    return oldRequest.then(async (outcome) => {
      expect(outcome.kind).to.equal("error");
      if (outcome.kind === "error") {
        expect(isSensitiveAuthorityChangedError(outcome.error)).to.equal(true);
      }

      const freshResult = await runSensitiveAdmissionMutation(slug, () =>
        Promise.resolve("fresh-response"),
      );
      expect(freshResult).to.equal("fresh-response");
    });
  });

  it("purges before reloading when another tab announces a new actor", () => {
    const queryClient = new QueryClient();
    const scheduleKey = ["/admin/admission/webkom-open/schedule/"];
    queryClient.setQueryDefaults(scheduleKey, {
      meta: { sensitive: true, admissionSlug: "webkom-open" },
    });
    queryClient.setQueryData(scheduleKey, {
      schedule: [{ candidate: "Private candidate" }],
    });
    let reloadCount = 0;
    const uninstall = installSensitiveActorSynchronization(
      queryClient,
      "actor-a",
      () => {
        reloadCount += 1;
      },
    );

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: SENSITIVE_ACTOR_STORAGE_KEY,
        newValue: JSON.stringify({ actorId: "actor-b" }),
      }),
    );

    expect(queryClient.getQueryData(scheduleKey)).to.equal(undefined);
    expect(reloadCount).to.equal(1);
    uninstall();
    window.localStorage.removeItem(SENSITIVE_ACTOR_STORAGE_KEY);
  });

  it("waits for server-confirmed logout before purging and broadcasting", () => {
    const queryClient = new QueryClient();
    const slug = "webkom-open";
    const scheduleKey = [`/admin/admission/${slug}/schedule/`];
    queryClient.setQueryDefaults(scheduleKey, {
      meta: { sensitive: true, admissionSlug: slug },
    });
    queryClient.setQueryData(scheduleKey, {
      schedule: [{ candidate: "Private candidate" }],
    });
    let releaseRequest: ((value: string) => void) | undefined;
    const inFlight = runSensitiveAdmissionMutation(
      slug,
      () =>
        new Promise<string>((resolve) => {
          releaseRequest = resolve;
        }),
    ).then(
      (value) => ({ kind: "success" as const, value }),
      (error: unknown) => ({ kind: "error" as const, error }),
    );
    let storedActor = JSON.stringify({ actorId: "actor-a" });
    const storage = {
      getItem: () => storedActor,
      setItem: (_key: string, value: string) => {
        storedActor = value;
      },
    };
    let confirmLogout: ((response: { ok: boolean }) => void) | undefined;
    const request = () =>
      new Promise<{ ok: boolean }>((resolve) => {
        confirmLogout = resolve;
      });
    const navigations: string[] = [];

    const logout = completeSensitiveLogout(queryClient, {
      request,
      navigate: (path) => navigations.push(path),
      storage,
    });
    expect(queryClient.getQueryData(scheduleKey)).to.deep.equal({
      schedule: [{ candidate: "Private candidate" }],
    });
    expect(storedActor).to.equal(JSON.stringify({ actorId: "actor-a" }));
    expect(navigations).to.deep.equal([]);

    confirmLogout?.({ ok: true });
    return logout.then(async (completed) => {
      expect(completed).to.equal(true);
      expect(queryClient.getQueryData(scheduleKey)).to.equal(undefined);
      expect(storedActor).to.equal(JSON.stringify({ actorId: null }));
      expect(navigations).to.deep.equal(["/"]);

      releaseRequest?.("private-old-response");
      const outcome = await inFlight;
      expect(outcome.kind).to.equal("error");
      if (outcome.kind === "error") {
        expect(isSensitiveAuthorityChangedError(outcome.error)).to.equal(true);
      }
    });
  });

  it("falls back to direct server navigation without broadcasting on logout failure", () => {
    const queryClient = new QueryClient();
    const scheduleKey = ["/admin/admission/webkom-open/schedule/"];
    queryClient.setQueryDefaults(scheduleKey, {
      meta: { sensitive: true, admissionSlug: "webkom-open" },
    });
    queryClient.setQueryData(scheduleKey, { schedule: ["private-row"] });
    let storedActor = JSON.stringify({ actorId: "actor-a" });
    const navigations: string[] = [];

    return completeSensitiveLogout(queryClient, {
      request: () => Promise.resolve({ ok: false }),
      navigate: (path) => navigations.push(path),
      storage: {
        getItem: () => storedActor,
        setItem: (_key, value) => {
          storedActor = value;
        },
      },
    }).then((completed) => {
      expect(completed).to.equal(false);
      expect(queryClient.getQueryData(scheduleKey)).to.deep.equal({
        schedule: ["private-row"],
      });
      expect(storedActor).to.equal(JSON.stringify({ actorId: "actor-a" }));
      expect(navigations).to.deep.equal(["/logout/"]);
    });
  });

  it("keeps booting when browser storage is unavailable", () => {
    const unavailableStorage = {
      getItem: () => {
        throw new Error("Storage disabled");
      },
      setItem: () => {
        throw new Error("Storage disabled");
      },
    };

    expect(() =>
      publishSensitiveActorIdentity("actor-a", unavailableStorage),
    ).not.to.throw();
  });
});
