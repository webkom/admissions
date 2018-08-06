import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter as Router, Route, Switch } from "react-router-dom";

import NotFoundPage from "src/routes/NotFoundPage";
import LandingPage from "src/routes/LandingPage/";
import ApplicationPortal from "src/routes/ApplicationPortal";

import ScrollToTop from "./scrollToTop";
import "src/styles/globals.css";
import "./index.css";

ReactDOM.render(
  <Router>
    <ScrollToTop>
      <div>
        <main>
          <Switch>
            <Route exact path="/" component={LandingPage} />
            <Route
              exact
              path="/(committees|application|admin)"
              component={ApplicationPortal}
            />
            <Route component={NotFoundPage} />
          </Switch>
        </main>
      </div>
    </ScrollToTop>
  </Router>,
  document.getElementById("root")
);

if (module.hot) {
  module.hot.accept();
}
