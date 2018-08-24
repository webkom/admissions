import * as React from "react";
import Raven from "raven-js";
import awSnap from "assets/sentry-aw-snap.svg";
import styled from "styled-components";

const Container = styled("div")`
  display: flex;
  justify-content: center;
`;
const Snap = styled("div")`
  border: 1px red dashed;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 10px;
  padding: 10px;

  img {
    height: 100px;
    width: 100px;
  }
`;

const Message = styled("div")`
  margin-left: 10px;
`;

class ErrorBoundary extends React.Component {
  state = {
    error: null
  };

  openDialog = () => {
    Raven.lastEventId() && Raven.showReportDialog({});
  };

  static getDerivedStateFromProps(nextProps, prevState) {
    const { resetOnChange } = prevState;
    if (nextProps.resetOnChange !== resetOnChange) {
      return {
        ...prevState,
        resetOnChange,
        error: null
      };
    }
    return null;
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error });
    Raven.captureException(error, { extra: errorInfo });
    if (this.props.openReportDialog) {
      this.openDialog();
    }
  }

  render() {
    const { openReportDialog, hidden = false, children, ...rest } = this.props;

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
              {!openReportDialog &&
                Raven.lastEventId() && (
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
