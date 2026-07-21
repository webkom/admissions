import { CSVLink } from "react-csv";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

export const SectionCard = styled.section`
  width: 100%;
  background: var(--color-surface-base);
  border: var(--border-width-emphasis) solid var(--color-border-soft);
  border-radius: var(--border-radius-lg);
  padding: var(--spacing-2xl) var(--spacing-3xl);
  box-shadow: var(--shadow-sm);

  ${media.handheld`
    padding: var(--spacing-md);
  `}
`;

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

export const GroupFilterButton = styled.button<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-lg);
  min-width: 0;
  width: 100%;
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: var(--border-radius-md);
  border: var(--border-width-emphasis) solid
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
  gap: var(--spacing-lg);
  min-width: 0;
`;

export const GroupFilterLogo = styled.img`
  object-fit: scale-down;
  width: var(--spacing-3xl);
  height: var(--spacing-3xl);
  flex-shrink: 0;
`;

export const GroupFilterName = styled.span`
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-tight);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const GroupFilterCount = styled.span`
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
  font-weight: var(--font-weight-semibold);
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
