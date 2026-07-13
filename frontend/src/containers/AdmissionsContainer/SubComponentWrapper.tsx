import styled from "styled-components";

const SubComponentWrapper = styled.div`
  background-color: var(--color-surface-subtle);
  padding: 0.75rem 0.5rem;

  p {
    margin: 0.25em 0;
  }

  p:first-of-type {
    margin-top: 0;
  }
`;

export default SubComponentWrapper;
