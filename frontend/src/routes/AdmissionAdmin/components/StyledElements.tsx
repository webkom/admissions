import { CSVLink } from "react-csv";
import styled from "styled-components";

export const SectionTitle = styled.h2`
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
`;

export const SectionDescription = styled.p`
  margin: var(--spacing-md) 0 0;
  max-width: var(--content-width-readable);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
`;

export const TableWrapper = styled.div`
  max-width: 100%;
  width: 100%;
  overflow: auto;
  border-radius: var(--border-radius-lg);
  border: var(--border-width-emphasis) solid var(--color-border-soft);
  background: var(--color-surface-base);
  box-shadow: var(--shadow-sm);
`;

// eslint-disable-next-line
//@ts-ignore
export const CSVExport = styled(CSVLink)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  min-height: var(--control-height-md);
  padding: 0 var(--spacing-xl);
  border-radius: var(--border-radius-pill);
  background: var(--color-red-6);
  color: var(--color-absolute-white);
  font-size: var(--font-size-sm);
  text-align: center;
  font-weight: var(--font-weight-semibold);
  text-decoration: none;
  transition: background var(--easing-fast);
  border: var(--border-width-emphasis) solid var(--color-red-6);

  &:hover {
    background: var(--color-red-7);
    border-color: var(--color-red-7);
    color: var(--color-absolute-white);
  }
`;
