import "vite/modulepreload-polyfill";
import React, { PropsWithChildren, Suspense } from "react";
import {
  BrowserRouter as Router,
  useParams,
  useRoutes,
} from "react-router-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { defaultQueryFn } from "./query/queries";

import NotFoundPage from "src/routes/NotFoundPage";
import ErrorBoundary from "src/containers/ErrorBoundary/";
import "@webkom/lego-bricks/dist/style.css";

import ScrollToTop from "./scrollToTop";
import * as Sentry from "@sentry/browser";
import "src/styles/globals.css";
import "src/styles/linkSlide.css";
import config from "src/utils/config";
import { isLoggedIn, isManager } from "src/utils/djangoData";
import RequireAuth from "src/components/RequireAuth";

const LandingPage = React.lazy(() => import("src/routes/LandingPage/"));
const ApplicationPortal = React.lazy(
  () => import("src/routes/ApplicationPortal"),
);
const ManageAdmissions = React.lazy(
  () => import("src/routes/ManageAdmissions"),
);

Sentry.init({
  dsn: config.SENTRY_DSN,
  release: config.RELEASE,
  environment: config.ENVIRONMENT,
  sendDefaultPii: false,
  beforeBreadcrumb(breadcrumb) {
    if (["console", "fetch", "xhr"].includes(breadcrumb.category ?? "")) {
      return null;
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
    return {
      event_id: event.event_id,
      timestamp: event.timestamp,
      platform: event.platform,
      level: event.level,
      release: event.release,
      environment: event.environment,
      exception: exceptionValues ? { values: exceptionValues } : undefined,
    };
  },
});

const queryClient = new QueryClient({
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

const container = document.getElementById("root");
if (!container) {
  throw new Error("Failed to find root element");
}
const root = createRoot(container);

const App: React.FC<PropsWithChildren> = ({ children }) => <>{children}</>;

const ScopedApplicationPortal = () => {
  const { admissionSlug } = useParams();
  return <ApplicationPortal key={admissionSlug} />;
};

const AppRoutes = () =>
  useRoutes([
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
      path: ":admissionSlug/*",
      element: (
        <RequireAuth auth={isLoggedIn()}>
          <ScopedApplicationPortal />
        </RequireAuth>
      ),
    },
    { path: "*", element: <NotFoundPage /> },
  ]);

root.render(
  <ErrorBoundary>
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <Router>
          <ScrollToTop>
            <App>
              <Suspense fallback={<p>Laster…</p>}>
                <AppRoutes />
              </Suspense>
            </App>
          </ScrollToTop>
        </Router>
      </QueryClientProvider>
    </React.StrictMode>
  </ErrorBoundary>,
);
