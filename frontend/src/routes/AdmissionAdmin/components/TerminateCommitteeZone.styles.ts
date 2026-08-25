import styled from "styled-components";
import { breakpoints } from "src/styles/designTokens";

const DangerZone = styled.details`
  margin-top: var(--spacing-3xl);
  border-top: var(--border-width-default) solid var(--color-border-soft);

  summary {
    padding: var(--spacing-lg) 0;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);

    &:hover {
      color: var(--color-text-primary);
    }
  }
`;

const DangerZoneContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding-bottom: var(--spacing-lg);
`;

const TerminationScopeHint = styled.p`
  width: 100%;
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
`;

const TerminateCommitteePanel = styled.section`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-lg);
  width: 100%;
  padding: var(--spacing-lg);
  border: var(--border-width-default) solid var(--color-danger-border);
  border-radius: var(--border-radius-md);
  background: var(--color-danger-bg);

  h2,
  p {
    margin: 0;
  }

  h2 {
    color: var(--color-danger);
    font-size: var(--font-size-md);
  }

  p {
    margin-top: var(--spacing-xs);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-base);
  }

  @media screen and (max-width: ${breakpoints.compact}) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const TerminateText = styled.div`
  min-width: 0;
  flex: 1 1 auto;

  h2 {
    margin: 0;
    color: var(--color-danger);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
  }

  p {
    margin: var(--spacing-xs) 0 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-copy);
    max-width: 36rem;
  }
`;

const TerminationStatus = styled.p`
  width: 100%;
  margin: 0;
  padding: var(--spacing-md);
  border: var(--border-width-default) solid var(--color-success-border);
  border-radius: var(--border-radius-md);
  background: var(--color-success-bg);
  color: var(--color-success);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
`;

const TerminationError = styled.p`
  width: 100%;
  margin: 0;
  padding: var(--spacing-md);
  border: var(--border-width-default) solid var(--color-danger-border);
  border-radius: var(--border-radius-md);
  background: var(--color-danger-bg);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
`;

const DialogTerminationError = styled.p`
  margin: var(--spacing-md) 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
`;

const TerminationInput = styled.input`
  width: 100%;
  min-height: var(--control-height-md);
  margin-top: var(--spacing-xs);
  padding: 0 var(--spacing-md);
  border: var(--border-width-default) solid var(--color-border-muted);
  border-radius: var(--border-radius-sm);
  background: var(--color-surface-base);
  color: var(--color-text-primary);
  font: inherit;

  &:focus {
    border-color: var(--color-brand);
    outline: none;
    box-shadow: 0 0 0 3px var(--color-brand-ring-soft);
  }
`;

export {
  DangerZone,
  DangerZoneContent,
  DialogTerminationError,
  TerminateText,
  TerminationError,
  TerminationInput,
  TerminationScopeHint,
  TerminationStatus,
  TerminateCommitteePanel,
};
