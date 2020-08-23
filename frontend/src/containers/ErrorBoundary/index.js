import * as React from "react";
import * as Sentry from "@sentry/browser";
import awSnap from "assets/sentry-aw-snap.svg";
import styled from "styled-components";

class ErrorBoundary extends React.Component {
  state = {
    error: null,
    lastEventId: null
  };

  openDialog = () => {
    this.state.lastEventId &&
      Sentry.showReportDialog({
        eventId: this.state.lastEventId,
        lang: "no",
        title: "Det skjedde en feil :(",
        subtitle: "Webkom har fått beskjed.",
        subtitle2:
          "Gjerne beskriv hva som skjedde, så kan vi fikse problemet kjappere."
      });
  };

  UNSAFE_componentWillReceiveProps(nextProps) {
    const { resetOnChange } = this.props;
    const { error } = this.state;
    if (error && nextProps.resetOnChange !== resetOnChange) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error });
    Sentry.withScope(scope => {
      scope.setExtras(errorInfo);
      const lastEventId = Sentry.captureException(error);
      this.setState({ lastEventId }, () => {
        this.props.openReportDialog && this.openDialog();
      });
    });
  }

  render() {
    const { openReportDialog, hidden = false, children, ...rest } = this.props;
    const { lastEventId } = this.state;

    if (!this.state.error) {
      return React.Children.map(children, child =>
        React.cloneElement(child, { ...rest })
      );
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
