import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

export const Wrapper = styled.div`
  width: 100%;
  max-width: var(--lego-max-width);
  min-height: 10em;
  padding: 0;
  border-radius: var(--border-radius-lg);
  background: var(--color-surface-base);
  border: 1px solid var(--color-border-soft);

  ${media.handheld`
     width: 100%;
  `};
`;

export const FormWrapper = styled.div`
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  flex-wrap: wrap;
  ${media.handheld`
     padding: 1em;
  `};
`;

export const GroupLogo = styled.img`
  object-fit: scale-down;
  width: 3.5rem;
  height: 3.5rem;
`;

export const GroupLogoWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
`;

export const EditGroupFormWrapper = styled.div`
  display: flex;
  width: 100%;
  margin-bottom: 0.5em;

  div {
    flex: 1 1 100%;
    margin: 0 0.5em;
  }

  ${media.handheld`
    flex-wrap: wrap;
  `};
`;
