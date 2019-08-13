import styled from "styled-components";
import Textarea from "react-textarea-autosize";

export const StyledTextarea = styled(Textarea)`
  border: 1px solid rgba(0, 0, 0, 0.09);
  border-radius: 3px;
  color: black;
  margin: 0.3em 0 0.5em 0;
  padding: 0.6em 1em;
  resize: none;
  font-family: var(--font-family);
  font-size: 1rem;

  width: 15em;
  overflow: hidden;
`;
