import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const Wrapper = styled.div`
  background: #eae9e8c7;
  border: 2px solid #c0392b;
  margin-bottom: 10px;

  &: nth-child(odd) {
    background: #d8d8d88a;
  }

  ${media.handheld`
     padding: 0 1em;
  `};
`;

export default Wrapper;
