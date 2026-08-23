import styled from "styled-components";

import { breakpoints } from "src/styles/designTokens";

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  width: 100%;
`;

const ErrorState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-md);
  max-width: var(--content-width-form);
  padding: var(--spacing-xl);

  h2,
  p {
    margin: 0;
  }
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-md) 0 var(--spacing-lg);
  border-bottom: var(--border-width-default) solid var(--color-border-soft);

  @media screen and (max-width: ${breakpoints.compact}) {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--spacing-md);
  }
`;

const Title = styled.h1`
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--font-size-xl);
  font-weight: 600;
  line-height: var(--line-height-base);
  text-align: left;
`;

const ResultMeta = styled.p`
  width: 100%;
  margin: var(--spacing-xs) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
`;

const HeaderControls = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-xl);
  flex-wrap: wrap;
  justify-content: flex-end;

  @media screen and (max-width: ${breakpoints.compact}) {
    width: 100%;
    gap: var(--spacing-sm);
    justify-content: flex-start;

    button {
      flex: 1 1 10rem;
      justify-content: center;
    }
  }
`;

const FilterSection = styled.section`
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: var(--spacing-lg);
  width: 100%;
  padding: 0 0 var(--spacing-md);
  border-bottom: var(--border-width-default) solid var(--color-border-soft);

  @media screen and (max-width: ${breakpoints.compact}) {
    gap: var(--spacing-md);

    > label:first-child {
      flex-basis: 100%;
    }

    > div {
      flex: 1 1 9rem;
    }
  }
`;

const SearchField = styled.label`
  display: flex;
  flex: 1 1 20rem;
  align-items: center;
  gap: var(--spacing-sm);
  min-height: var(--control-height-md);
  padding: 0 var(--spacing-md);
  border: var(--border-width-default) solid var(--color-border-muted);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-base);
  color: var(--color-text-muted);

  &:focus-within {
    border-color: var(--color-brand);
    box-shadow: 0 0 0 3px var(--color-brand-ring-soft);
  }

  input {
    min-width: 0;
    width: 100%;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--color-text-primary);
    font: inherit;
  }
`;

const FilterControl = styled.div`
  display: flex;
  flex: 0 1 11rem;
  flex-direction: column;
  gap: var(--spacing-xs);
  min-width: 9rem;
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
  font-weight: var(--font-weight-semibold);
`;

const ResetFilters = styled.button`
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  min-height: var(--control-height-md);
  padding: var(--spacing-sm) var(--spacing-md);
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);

  &:hover {
    color: var(--color-text-primary);
  }

  &:focus-visible {
    border-radius: var(--border-radius-sm);
    outline: none;
    box-shadow: 0 0 0 3px var(--color-brand-ring-soft);
  }
`;

const EmptyResults = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-3xl) var(--spacing-xl);
  border: var(--border-width-default) dashed var(--color-border-muted);
  border-radius: var(--border-radius-lg);
  color: var(--color-text-muted);
  text-align: center;

  strong {
    color: var(--color-text-primary);
    font-size: var(--font-size-md);
  }

  button {
    margin-top: var(--spacing-md);
    border: 0;
    background: transparent;
    color: var(--color-brand);
    cursor: pointer;
    font: inherit;
    font-weight: var(--font-weight-semibold);
  }
`;

export {
  PageWrapper,
  ErrorState,
  Header,
  Title,
  ResultMeta,
  HeaderControls,
  FilterSection,
  SearchField,
  FilterControl,
  ResetFilters,
  EmptyResults,
};
