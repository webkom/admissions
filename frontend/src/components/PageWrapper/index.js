import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;

  ${media.portrait`
    width: 60em;
  `};

  ${media.handheld`
    width: 95vw;
  `};
`;

export default PageWrapper;
