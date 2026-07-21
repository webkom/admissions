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
  min-height: var(--error-state-min-height);
`;

const Snap = styled.div`
  border: var(--border-width-default) var(--color-danger) dashed;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: var(--spacing-sm);
  padding: var(--spacing-xl);

  img {
    height: var(--error-illustration-size);
    width: var(--error-illustration-size);
  }
`;

const Message = styled.div`
  margin-left: var(--spacing-lg);
`;

const RetryButton = styled.button`
  border: var(--border-width-default) solid currentcolor;
  border-radius: var(--border-radius-md);
  background: transparent;
  padding: var(--spacing-sm) var(--spacing-md);
  color: inherit;
  font: inherit;
  font-weight: var(--font-weight-bold);
  cursor: pointer;

  &:focus-visible {
    outline: var(--focus-ring-width) solid currentcolor;
    outline-offset: var(--focus-ring-offset);
  }
`;
