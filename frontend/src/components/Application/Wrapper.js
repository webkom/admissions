import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const Wrapper = styled.div`
  padding: 1em;
  margin: 0 0 0.5em 0;
  width: 100%;
  display: flex;

  ${media.handheld`
    justify-content: center;
    margin: 0;
    padding: 0em;
  `};
`;

export default Wrapper;
