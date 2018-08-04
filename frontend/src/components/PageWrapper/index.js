import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 70em;
  margin: 0 auto;
  min-height: 100vh;
  ${media.handheld`
    width: 95vw;
    `};
`;

export default PageWrapper;
