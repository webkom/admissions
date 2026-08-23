import styled from "styled-components";

const PrivacyPreview = styled.section`
  position: relative;
  min-height: 34rem;
  overflow: hidden;
  border: var(--border-width-emphasis) solid var(--color-border-soft);
  border-radius: var(--border-radius-lg);
  background: linear-gradient(
      140deg,
      color-mix(in srgb, var(--color-surface-base) 82%, transparent),
      color-mix(in srgb, var(--color-surface-muted) 35%, transparent)
    ),
    var(--color-surface-base);
  box-shadow: var(--shadow-sm);
  isolation: isolate;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: var(--pattern-unavailable);
    opacity: 0.28;
    filter: blur(18px);
    transform: scale(1.1);
  }
`;

const PrivacySkeleton = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  opacity: 0.38;
  filter: blur(12px) grayscale(0.25) saturate(0.65);
  pointer-events: none;
  user-select: none;
  transform: scale(1.02);
`;

const SkeletonApplication = styled.div`
  display: grid;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-lg);
  background: var(--color-surface-base);
`;

const SkeletonApplicationHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding-bottom: var(--spacing-md);
  border-bottom: var(--border-width-default) solid var(--color-border-soft);
`;

const SkeletonApplicationTitle = styled.div`
  width: 11rem;
  height: 1rem;
  border-radius: var(--border-radius-pill);
  background: var(--color-border-muted);
`;

const SkeletonApplicationAction = styled.div`
  width: 2rem;
  height: 2rem;
  border-radius: var(--border-radius-sm);
  background: var(--color-surface-neutral);
`;

const SkeletonApplicationBody = styled.div`
  display: grid;
  gap: var(--spacing-lg);
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media screen and (max-width: var(--breakpoint-compact)) {
    grid-template-columns: 1fr;
  }
`;

const SkeletonAnswer = styled.div<{ $width: string }>`
  display: grid;
  gap: var(--spacing-xs);

  &::before {
    width: 5rem;
    height: 0.65rem;
    border-radius: var(--border-radius-pill);
    background: var(--color-border-muted);
    content: "";
  }

  &::after {
    width: ${({ $width }) => $width};
    height: 0.8rem;
    border-radius: var(--border-radius-pill);
    background: var(--color-surface-neutral);
    content: "";
  }
`;

const SkeletonFilters = styled.div`
  padding: var(--spacing-md);
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-lg);
`;

const SkeletonHeading = styled.div`
  width: 8rem;
  height: 1rem;
  margin-bottom: var(--spacing-lg);
  border-radius: var(--border-radius-pill);
  background: var(--color-border-muted);
`;

const SkeletonFilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--spacing-md);

  @media screen and (max-width: var(--breakpoint-compact)) {
    grid-template-columns: 1fr;
  }
`;

const SkeletonFilter = styled.div`
  height: var(--control-height-md);
  border-radius: var(--border-radius-lg);
  background: var(--color-surface-neutral);
`;

const SkeletonStatusRow = styled.div`
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-lg);
`;

const SkeletonPill = styled.div`
  width: 6rem;
  height: var(--control-height-sm);
  border-radius: var(--border-radius-pill);
  background: var(--color-surface-neutral);
`;

const SkeletonTable = styled.div`
  overflow: hidden;
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-lg);
`;

const SkeletonTableHeader = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(5rem, 1fr));
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--color-surface-neutral);
`;

const SkeletonTableRow = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(5rem, 1fr));
  gap: var(--spacing-md);
  min-height: 4.5rem;
  padding: var(--spacing-lg) var(--spacing-md);
  border-top: var(--border-width-default) solid var(--color-border-soft);
`;

const SkeletonLine = styled.div<{ $width: string }>`
  width: ${({ $width }) => $width};
  height: 0.75rem;
  border-radius: var(--border-radius-pill);
  background: var(--color-border-muted);
`;

const PrivacyAlert = styled.div`
  position: absolute;
  inset: 0;
  backdrop-filter: blur(16px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  padding: var(--spacing-xl);
  background: color-mix(in srgb, var(--color-surface-base) 68%, transparent);
  color: var(--color-text-muted);
  text-align: center;
  border: 1px solid
    color-mix(in srgb, var(--color-danger-border) 24%, transparent);
  box-shadow:
    inset 0 0 0 1px
      color-mix(in srgb, var(--color-surface-base) 82%, transparent),
    inset 0 0 28px
      color-mix(in srgb, var(--color-danger-border) 18%, transparent);
  z-index: 1;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: var(--pattern-unavailable);
    opacity: 0.24;
    pointer-events: none;
  }

  > div:nth-child(2) {
    max-width: var(--content-width-md);
  }
`;

const PrivacyAlertIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--control-height-md);
  height: var(--control-height-md);
  border: var(--border-width-default) solid
    color-mix(in srgb, var(--color-danger-border) 72%, transparent);
  border-radius: var(--border-radius-pill);
  background: color-mix(in srgb, var(--color-danger-bg) 58%, transparent);
  color: var(--color-danger);
`;

const PrivacyAlertTitle = styled.h2`
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--font-size-heading-sm);
  font-weight: 600;
`;

const PrivacyAlertText = styled.p`
  margin: var(--spacing-sm) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
`;

export {
  PrivacyPreview,
  PrivacySkeleton,
  SkeletonApplication,
  SkeletonApplicationAction,
  SkeletonApplicationBody,
  SkeletonApplicationHeader,
  SkeletonApplicationTitle,
  SkeletonAnswer,
  SkeletonFilter,
  SkeletonFilterGrid,
  SkeletonFilters,
  SkeletonHeading,
  SkeletonLine,
  SkeletonPill,
  SkeletonStatusRow,
  SkeletonTable,
  SkeletonTableHeader,
  SkeletonTableRow,
  PrivacyAlert,
  PrivacyAlertIcon,
  PrivacyAlertTitle,
  PrivacyAlertText,
};
