import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

export const Wrapper = styled.div`
  width: 100%;
  max-width: 980px;
  min-height: 10em;
  padding: 0;
  border-radius: 1rem;
  background: #fff;
  border: 1px solid #e5e7eb;

  ${media.handheld`
     width: 100%;
  `};
`;

export const FormWrapper = styled.div`
  padding: 1.5rem;
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
  gap: 1rem;
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
