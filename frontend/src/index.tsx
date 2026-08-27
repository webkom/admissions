import "vite/modulepreload-polyfill";
import React, { Suspense } from "react";
import {
  createBrowserRouter,
  Outlet,
  RouterProvider,
  useParams,
} from "react-router-dom";
import { createRoot } from "react-dom/client";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { defaultQueryFn } from "./query/queries";
import {
  areSensitiveCacheWritesBlocked,
  blockSensitiveAdmissionCacheWrites,
  getSensitiveAdmissionAccessError,
  getSensitiveAccessError,
  purgeSensitiveAdmissionQueries,
  purgeSensitiveMutations,
  purgeSensitiveQueries,
  purgeSensitiveQuery,
} from "./query/sensitiveAccess";
import { installSensitiveActorSynchronization } from "./query/sensitiveActorSync";

import NotFoundPage from "src/routes/NotFoundPage";
import ErrorBoundary from "src/containers/ErrorBoundary/";
import "@webkom/lego-bricks/dist/style.css";

import ScrollToTop from "./scrollToTop";
import * as Sentry from "@sentry/browser";
import "src/styles/globals.css";
import "src/styles/linkSlide.css";
import config from "src/utils/config";
import djangoData, {
  isLoggedIn,
  isManager,
  isMemberOfWebkom,
} from "src/utils/djangoData";
import RequireAuth from "src/components/RequireAuth";

const LandingPage = React.lazy(() => import("src/routes/LandingPage/"));
const ApplicationPortal = React.lazy(
  () => import("src/routes/ApplicationPortal"),
);
const ManageAdmissions = React.lazy(
  () => import("src/routes/ManageAdmissions"),
);
const ManageGodUsers = React.lazy(() => import("src/routes/ManageGodUsers"));

Sentry.init({
  dsn: config.SENTRY_DSN,
  release: config.RELEASE,
  environment: config.ENVIRONMENT,
  sendDefaultPii: false,
  beforeBreadcrumb(breadcrumb) {
    const category = breadcrumb.category ?? "";
    // Request and console breadcrumbs carry URLs and logged payloads, both of
    // which can hold applicant/candidate data. Dropped outright.
    if (["console", "fetch", "xhr"].includes(category)) {
      return null;
    }
    // UI breadcrumbs are kept for the interaction trail but stripped of their
    // message: it is built from the clicked element's text, which on these
    // pages is very often a candidate's name.
    if (category.startsWith("ui.")) {
      return {
        category,
        type: breadcrumb.type,
        timestamp: breadcrumb.timestamp,
      };
    }
    // Navigation keeps the path but never the query string, same rule as the
    // api.route tag below.
    if (category === "navigation") {
      const data = breadcrumb.data ?? {};
      return {
        category,
        type: breadcrumb.type,
        timestamp: breadcrumb.timestamp,
        data: {
          from: String(data.from ?? "").split("?")[0],
          to: String(data.to ?? "").split("?")[0],
        },
      };
    }
    return breadcrumb;
  },
  beforeSend(event) {
    const exceptionValues = event.exception?.values?.map((value) => ({
      type: value.type,
      value: value.type || "Client error",
      stacktrace: value.stacktrace
        ? {
            frames: value.stacktrace.frames?.map((frame) => ({
              filename: frame.filename,
              function: frame.function,
              module: frame.module,
              lineno: frame.lineno,
              colno: frame.colno,
              in_app: frame.in_app,
            })),
          }
        : undefined,
    }));
    // Everything else is dropped by default - these are the only tag keys
    // known never to carry applicant/candidate data, so they're let through
    // instead of scrubbed. Keep in sync with utils/sentry.py's backend
    // allowlist.
    const allowedTagKeys = ["api.status", "api.method", "api.route"];
    const tags = event.tags
      ? Object.fromEntries(
          Object.entries(event.tags).filter(([key]) =>
            allowedTagKeys.includes(key),
          ),
        )
      : undefined;
    return {
      event_id: event.event_id,
      timestamp: event.timestamp,
      platform: event.platform,
      level: event.level,
      release: event.release,
      environment: event.environment,
      transaction: event.transaction,
      tags: tags && Object.keys(tags).length > 0 ? tags : undefined,
      exception: exceptionValues ? { values: exceptionValues } : undefined,
      // Retained so an incident has a trail to read. Safe to pass through
      // because beforeBreadcrumb above has already dropped the request and
      // console categories outright and stripped the rest down to
      // category/type/timestamp (plus a query-less path for navigation).
      breadcrumbs: event.breadcrumbs,
    };
  },
});

const sensitiveFailureStatuses = new Set([401, 403, 404]);

const queryCache = new QueryCache({
  onError(error, failedQuery) {
    if (
      failedQuery.meta?.sensitive !== true ||
      !isAxiosError(error) ||
      !sensitiveFailureStatuses.has(error.response?.status ?? 0)
    ) {
      return;
    }

    const status = error.response?.status;
    if (status === 404) {
      const admissionSlug = failedQuery.meta?.admissionSlug;
      if (
        failedQuery.meta?.purgeAdmissionOnNotFound === true &&
        typeof admissionSlug === "string"
      ) {
        const accessError = blockSensitiveAdmissionCacheWrites(
          admissionSlug,
          error,
        );
        purgeSensitiveAdmissionQueries(
          queryCache.getAll(),
          admissionSlug,
          accessError,
          false,
        );
        purgeSensitiveMutations(queryClient, admissionSlug);
        return;
      }
      purgeSensitiveQuery(failedQuery, error);
      return;
    }
    purgeSensitiveQueries(queryCache.getAll(), error, true);
    purgeSensitiveMutations(queryClient);
  },
});

queryCache.subscribe((event) => {
  const admissionSlug = event.query.meta?.admissionSlug;
  const accessError =
    getSensitiveAccessError() ??
    (typeof admissionSlug === "string"
      ? getSensitiveAdmissionAccessError(admissionSlug)
      : null);
  if (
    event.type !== "updated" ||
    event.action.type !== "success" ||
    event.query.meta?.sensitive !== true ||
    !accessError
  ) {
    return;
  }
  purgeSensitiveQuery(event.query, accessError);
});

const getSensitiveMutationBlockError = (
  meta: Record<string, unknown> | undefined,
) => {
  const admissionSlug = meta?.admissionSlug;
  return (
    getSensitiveAccessError() ??
    (typeof admissionSlug === "string"
      ? getSensitiveAdmissionAccessError(admissionSlug)
      : null)
  );
};

const mutationCache = new MutationCache({
  onMutate(_variables, mutation) {
    const accessError = getSensitiveMutationBlockError(mutation.meta);
    if (mutation.meta?.sensitive === true && accessError) throw accessError;
  },
  onSuccess(_data, _variables, _context, mutation) {
    const accessError = getSensitiveMutationBlockError(mutation.meta);
    if (mutation.meta?.sensitive === true && accessError) throw accessError;
  },
  onError(error) {
    if (
      !isAxiosError(error) ||
      ![401, 403].includes(error.response?.status ?? 0)
    ) {
      return;
    }
    purgeSensitiveQueries(queryCache.getAll(), error, true);
    purgeSensitiveMutations(queryClient);
  },
});

mutationCache.subscribe((event) => {
  if (
    event.type !== "updated" ||
    !["error", "success"].includes(event.action.type) ||
    event.mutation.meta?.sensitive !== true ||
    (!areSensitiveCacheWritesBlocked() &&
      (typeof event.mutation.meta?.admissionSlug !== "string" ||
        !getSensitiveAdmissionAccessError(event.mutation.meta.admissionSlug)))
  ) {
    return;
  }
  mutationCache.remove(event.mutation);
});

const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      queryFn: defaultQueryFn,
      staleTime: 60000,
      retry: false,
    },
  },
});

installSensitiveActorSynchronization(queryClient, djangoData.user.id || null);

const container = document.getElementById("root");
if (!container) {
  throw new Error("Failed to find root element");
}
const root = createRoot(container);

const ScopedApplicationPortal = () => {
  const { admissionSlug } = useParams();
  return <ApplicationPortal key={admissionSlug} />;
};

const AppLayout = () => (
  <ScrollToTop>
    <Suspense fallback={<p>Laster…</p>}>
      <Outlet />
    </Suspense>
  </ScrollToTop>
);

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <LandingPage /> },
      {
        path: "/manage/*",
        element: (
          <RequireAuth auth={isManager()}>
            <ManageAdmissions />
          </RequireAuth>
        ),
      },
      {
        path: "/god-users/*",
        element: (
          <RequireAuth auth={isMemberOfWebkom()}>
            <ManageGodUsers />
          </RequireAuth>
        ),
      },
      {
        path: ":admissionSlug/*",
        element: (
          <RequireAuth auth={isLoggedIn()}>
            <ScopedApplicationPortal />
          </RequireAuth>
        ),
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

root.render(
  <ErrorBoundary>
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>
  </ErrorBoundary>,
);
