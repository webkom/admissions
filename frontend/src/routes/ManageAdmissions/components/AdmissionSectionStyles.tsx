import styled from "styled-components";

export const Section = styled.section`
  padding: var(--spacing-3xl) 0;
  border-top: var(--border-width-default) solid var(--color-border-soft);
`;

export const SectionHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-xl);
`;

export const SectionNumber = styled.span`
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: var(--control-height-sm);
  height: var(--control-height-sm);
  border-radius: var(--border-radius-pill);
  background: var(--color-brand);
  color: var(--color-absolute-white);
  font-size: var(--font-size-detail);
  font-weight: var(--font-weight-bold);
`;

export const SectionTitle = styled.h2`
  margin: 0;
  font-size: var(--font-size-heading-xs);
`;

export const SectionDescription = styled.p`
  max-width: var(--content-width-readable);
  margin: var(--spacing-xs) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
`;
