import styled from "styled-components";

const Wrapper = styled.div`
  padding: 1em;
  margin: 0.5em 0;

  display: grid;
  grid-template-columns: 6em 1fr;
  grid-template-rows: repeat(3, auto);
  grid-template-areas:
    "logo groupName"
    "logo ."
    "logo applicationText";
  align-items: center;
`;

export default Wrapper;
