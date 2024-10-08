import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import { Card } from "src/components/Card";

export const Wrapper = styled(Card)`
  width: 50em;
  min-height: 10em;
  padding: 0;

  ${media.handheld`
     width: 100%;
  `};
`;

export const FormWrapper = styled.div`
  padding: 1em 2em;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  ${media.handheld`
     padding: 1em;
  `};
`;

export const GroupLogo = styled.img`
  object-fit: scale-down;
  max-height: 2em;
  margin-right: 0.5em;
`;

export const GroupLogoWrapper = styled.div`
  display: flex;
  align-items: center;
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
