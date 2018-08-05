import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const Wrapper = styled.div`
  &:nth-child(even) {
    background: #d3d3d3;
  }
  &:nth-child(odd) {
    background: #fff;
  }
`;

export default Wrapper;
