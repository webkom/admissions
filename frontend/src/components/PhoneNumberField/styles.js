import styled from "styled-components";
import { Field } from "formik";
import { CardTitle } from "src/components/Card";

export const StyledField = styled(Field)`
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

export const InfoText = styled(CardTitle.withComponent("div"))`
  font-size: 0.8rem;
  margin: 0.5em 0 0 0;
  color: gray;
  font-style: italic;
`;
