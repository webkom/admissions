import styled from "styled-components";

const Wrapper = styled.div`
  background: #eae9e8c7;
  border-top: 4px solid #c0392b;
  padding: 1em 2em;

  &: nth-child(odd) {
    background: #d8d8d88a;
  }
`;

export default Wrapper;
