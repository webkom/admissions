import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 70em;
  margin: 1em auto;
  min-height: 100vh;

  ${media.portrait`
    width: 60em;
  `};

  ${media.handheld`
    width: 95vw;
  `};
`;

export default PageWrapper;
