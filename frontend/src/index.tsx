import "vite/modulepreload-polyfill";
import React, { PropsWithChildren, useEffect } from "react";
import { BrowserRouter as Router, useRoutes } from "react-router-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { defaultQueryFn } from "./query/queries";

import NotFoundPage from "src/routes/NotFoundPage";
import LandingPage from "src/routes/LandingPage/";
import ErrorBoundary from "src/containers/ErrorBoundary/";
import ApplicationPortal from "src/routes/ApplicationPortal";
import "@webkom/lego-bricks/dist/style.css";

import ScrollToTop from "./scrollToTop";
import * as Sentry from "@sentry/browser";
import "src/styles/globals.css";
import config from "src/utils/config";
import djangoData, { isLoggedIn, isManager } from "src/utils/djangoData";
import "@babel/polyfill";
import ManageAdmissions from "src/routes/ManageAdmissions";
import RequireAuth from "src/components/RequireAuth";

Sentry.init({
  dsn: config.SENTRY_DSN,
  release: config.RELEASE,
  environment: config.ENVIRONMENT,
  beforeSend(event) {
    return event;
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

const App: React.FC<PropsWithChildren> = ({ children }) => {
  useEffect(() => {
    Sentry.setUser(djangoData.user);
  }, [djangoData.user]);

  return <main>{children}</main>;
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
          <ApplicationPortal />
        </RequireAuth>
      ),
    },
    { path: "*", element: <NotFoundPage /> },
  ]);

root.render(
  <ErrorBoundary openReportDialog>
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <Router>
          <ScrollToTop>
            <App>
              <AppRoutes />
            </App>
          </ScrollToTop>
        </Router>
      </QueryClientProvider>
    </React.StrictMode>
  </ErrorBoundary>,
);
