import { CSVLink } from "react-csv";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

export const SectionCard = styled.section`
  width: 100%;
  background: var(--color-surface-base);
  border: 1.5px solid var(--color-border-soft);
  border-radius: var(--border-radius-lg);
  padding: 1.25rem 1.5rem;
  box-shadow: var(--shadow-sm);

  ${media.handheld`
    padding: var(--spacing-md);
  `}
`;

export const SectionTitle = styled.h2`
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-text-primary);
`;

export const SectionDescription = styled.p`
  margin: 0.35rem 0 0;
  max-width: 44rem;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: 1.3;
`;

export const GroupFilterButton = styled.button<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-width: 0;
  width: 100%;
  padding: 0.65rem 0.875rem;
  border-radius: var(--border-radius-md);
  border: 1.5px solid
    ${(props) =>
      props.$selected ? "var(--color-brand)" : "var(--color-border-soft)"};
  background: ${(props) =>
    props.$selected ? "var(--color-brand-soft)" : "var(--color-surface-base)"};
  color: var(--color-text-primary);
  cursor: pointer;
  transition:
    border-color var(--easing-fast),
    background var(--easing-fast);

  &:hover {
    border-color: ${(props) =>
      props.$selected
        ? "var(--color-brand-hover)"
        : "var(--color-border-quiet)"};
    background: var(--color-surface-subtle);
  }
`;

export const GroupFilterMeta = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
`;

export const GroupFilterLogo = styled.img`
  object-fit: scale-down;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
`;

export const GroupFilterName = styled.span`
  font-size: var(--font-size-sm);
  font-weight: 600;
  line-height: 1.25;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const GroupFilterCount = styled.span`
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
  font-weight: 600;
`;

export const TableWrapper = styled.div`
  max-width: 100%;
  width: 100%;
  overflow: auto;
  border-radius: var(--border-radius-lg);
  border: 1.5px solid var(--color-border-soft);
  background: var(--color-surface-base);
  box-shadow: var(--shadow-sm);
`;

// eslint-disable-next-line
//@ts-ignore
export const CSVExport = styled(CSVLink)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2.25rem;
  padding: 0 1rem;
  border-radius: 2rem;
  background: var(--color-red-6);
  color: var(--color-absolute-white);
  font-size: var(--font-size-sm);
  text-align: center;
  font-weight: 600;
  text-decoration: none;
  transition: background var(--easing-fast);
  border: 1.5px solid var(--color-red-6);

  &:hover {
    background: var(--color-red-7);
    border-color: var(--color-red-7);
    color: var(--color-absolute-white);
  }
`;
