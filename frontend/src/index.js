import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter as Router, Route, Switch } from "react-router-dom";

import NotFoundPage from "src/routes/NotFoundPage";
import LandingPage from "src/routes/LandingPage/";
import ErrorBoundary from "src/containers/ErrorBoundary/";
import MyApplications from "src/components/MyApplications/";
import ApplicationPortal from "src/routes/ApplicationPortal";

import ScrollToTop from "./scrollToTop";
import Raven from "raven-js";
import "src/styles/globals.css";
import "./index.css";
import config from "src/utils/config";
import "babel-polyfill";

Raven.config(config.RAVEN_DSN, {
  release: config.RELEASE,
  environment: config.ENVIRONMENT
}).install();

ReactDOM.render(
  <Router>
    <ScrollToTop>
      <div>
        <main>
          <ErrorBoundary>
            <Switch>
              <Route exact path="/" component={LandingPage} />
              <Route
                exact
                path="/(committees|application|admin)"
                component={ApplicationPortal}
              />
              <Route exact path="/myapplications" component={MyApplications} />
              <Route component={NotFoundPage} />
            </Switch>
          </ErrorBoundary>
        </main>
      </div>
    </ScrollToTop>
  </Router>,
  document.getElementById("root")
);

if (module.hot) {
  module.hot.accept();
}
