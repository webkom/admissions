import * as React from "react";
import * as Sentry from "@sentry/browser";
import awSnap from "assets/sentry-aw-snap.svg";
import styled from "styled-components";
import { PropsWithChildren } from "react";

interface ErrorBoundaryProps extends PropsWithChildren {
  resetOnChange?: boolean;
  resetKey?: React.Key;
  hidden?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    const resetSignalChanged =
      previousProps.resetOnChange !== this.props.resetOnChange;
    const resetKeyChanged = previousProps.resetKey !== this.props.resetKey;
    if (this.state.error && (resetSignalChanged || resetKeyChanged)) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error) {
    Sentry.captureException(error);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { hidden = false } = this.props;

    if (!this.state.error) {
      return this.props.children;
    }
    if (hidden) {
      return null;
    }

    return (
      <Container role="alert">
        <Snap>
          <img src={awSnap} alt="" />
          <Message>
            <h3>En feil har oppstått</h3>
            <p>Webkom har fått beskjed om feilen.</p>
            <RetryButton type="button" onClick={this.reset}>
              Prøv igjen
            </RetryButton>
          </Message>
        </Snap>
      </Container>
    );
  }
}

export default ErrorBoundary;

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
  padding: var(--spacing-xl);

  img {
    height: 100px;
    width: 100px;
  }
`;

const Message = styled.div`
  margin-left: 20px;
`;

const RetryButton = styled.button`
  border: 1px solid currentcolor;
  border-radius: var(--border-radius-md);
  background: transparent;
  padding: 0.5rem 0.75rem;
  color: inherit;
  font: inherit;
  font-weight: 700;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid currentcolor;
    outline-offset: 2px;
  }
`;
