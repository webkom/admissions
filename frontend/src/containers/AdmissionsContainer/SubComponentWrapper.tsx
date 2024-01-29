import styled from "styled-components";

const SubComponentWrapper = styled.div`
  background-color: #f5f5f5;
  padding: 0.5em;
  padding-top: 0;
  margin-left: -7px;

  p {
    margin: 0.25em 0;
  }

  p:first-of-type {
    margin-top: 0;
  }
`;

export default SubComponentWrapper;
