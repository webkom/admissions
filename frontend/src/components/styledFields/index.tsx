import React from "react";
import styled from "styled-components";
import { Field } from "formik";
import Textarea from "react-textarea-autosize";

interface StyledFieldProps {
  error?: boolean;
}

export const StyledField = styled(Field)<StyledFieldProps>`
  display: block;
  width: 20em;
  overflow: hidden;
  padding: 0.5rem 1rem;
  margin-top: 4px;
  font-size: 0.9rem;
  font-family: var(--font-family);
  color: var(--lego-font-color);
  border: 2px solid
    ${(props) => (props.error ? "var(--lego-red)" : "var(--lego-gray-medium)")};
  border-radius: 13px;
  box-shadow: inset 0px 4px 4px rgba(129, 129, 129, 0.1);
  resize: none;

  &:focus {
    border: 2px solid #52b0eccc;
    box-shadow: 0 1px 1px #52b0ec13 inset, 0 0 4px #52b0ec99;
    outline: 0 none;
  }

  &:disabled {
    background: var(--lego-gray-light);
  }
`;

export const StyledTextAreaField = styled(Textarea)<StyledFieldProps>`
  width: 100%;
  min-height: 8rem;
  padding: 1rem;
  margin-top: 4px;
  font-size: 0.9rem;
  font-family: var(--font-family);
  color: var(--lego-font-color);
  border: 2px solid
    ${(props) => (props.error ? "var(--lego-red)" : "var(--lego-gray-medium)")};
  border-radius: 13px;
  box-shadow: inset 0px 4px 4px rgba(129, 129, 129, 0.1);
  overflow: hidden;
  resize: none;

  &:focus {
    border: 2px solid #52b0eccc;
    box-shadow: 0 1px 1px #52b0ec13 inset, 0 0 4px #52b0ec99,
      inset 0px 4px 4px rgba(129, 129, 129, 0.05);
    outline: 0 none;
  }

  &:disabled {
    background: var(--lego-gray-light);
  }
`;

export const FieldLabel = styled.label`
  font-weight: 500;
  font-size: 0.95rem;
  line-height: 1.2rem;
  display: inline-block;
`;

interface InputValidationFeedbackProps {
  error?: string;
}

export const InputValidationFeedback: React.FC<
  InputValidationFeedbackProps
> = ({ error }) => (error ? <ValidationError>{error}</ValidationError> : null);

export const ValidationError = styled.div`
  color: var(--lego-red);
  font-weight: 500;
  font-size: 0.9rem;
`;
