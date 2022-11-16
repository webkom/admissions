import * as React from "react";
import * as Sentry from "@sentry/browser";
import awSnap from "assets/sentry-aw-snap.svg";
import styled from "styled-components";
import { PropsWithChildren } from "react";

interface ErrorBoundaryProps extends PropsWithChildren {
  resetOnChange?: boolean;
  openReportDialog?: boolean;
  hidden?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
  lastEventId: string | null;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state = {
    error: null,
    lastEventId: null,
  };

  openDialog = () => {
    this.state.lastEventId &&
      Sentry.showReportDialog({
        eventId: this.state.lastEventId,
        lang: "no",
        title: "Det skjedde en feil :(",
        subtitle: "Webkom har fått beskjed.",
        subtitle2:
          "Gjerne beskriv hva som skjedde, så kan vi fikse problemet kjappere.",
      });
  };

  UNSAFE_componentWillReceiveProps(nextProps: ErrorBoundaryProps) {
    const { resetOnChange } = this.props;
    const { error } = this.state;
    if (error && nextProps.resetOnChange !== resetOnChange) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error });
    if (process.env.NODE_ENV === "development") {
      /* eslint no-console: 0 */
      console.error(error);

      /* eslint no-console: 0 */
      console.error(errorInfo);
    }
    Sentry.withScope((scope) => {
      scope.setExtra("errorInfo", errorInfo);
      const lastEventId = Sentry.captureException(error);
      this.setState({ lastEventId }, () => {
        this.props.openReportDialog && this.openDialog();
      });
    });
  }

  render() {
    const { openReportDialog, hidden = false } = this.props;
    const { lastEventId } = this.state;

    if (!this.state.error) {
      return this.props.children;
    }
    if (hidden) {
      return null;
    }

    return (
      <Container>
        <Snap onClick={() => !openReportDialog && this.openDialog()}>
          <img src={awSnap} alt="snap" />
          <Message>
            <h3>En feil har oppstått</h3>
            <p>
              Webkom har fått beskjed om feilen.{" "}
              {!openReportDialog && lastEventId && (
                <span>
                  Klikk <b>her</b> for å sende en rapport.
                </span>
              )}
            </p>
          </Message>
        </Snap>
      </Container>
    );
  }
}

export default ErrorBoundary;

/** Styles **/

const Container = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 50vh;
`;

const Snap = styled.div`
  border: 1px red dashed;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 10px;
  padding: 2rem;

  img {
    height: 100px;
    width: 100px;
  }
`;

const Message = styled.div`
  margin-left: 20px;
`;
