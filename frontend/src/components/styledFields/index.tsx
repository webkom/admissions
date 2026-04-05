import React from "react";
import styled from "styled-components";
import { Field } from "formik";
import Textarea from "react-textarea-autosize";

interface StyledFieldProps {
  $error?: boolean;
}

export const StyledField = styled(Field)<StyledFieldProps>`
  display: block;
  width: 100%;
  max-width: 400px;
  padding: 0.75rem 1rem;
  margin-top: 0.5rem;
  font-size: 0.9375rem;
  color: #111827;
  border: 1px solid
    ${(props) => (props.error ? "var(--lego-red-color, #e11d48)" : "#d1d5db")};
  border-radius: var(--border-radius-md);
  background-color: white;
  transition: var(--transition-base);

  &::placeholder {
    color: #9ca3af;
  }

  &:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);
    outline: none;
  }

  &:disabled {
    background-color: #f3f4f6;
    color: #9ca3af;
    cursor: not-allowed;
  }
`;

export const StyledTextAreaField = styled(Textarea)<StyledFieldProps>`
  display: block;
  width: 100%;
  min-height: 10rem;
  padding: 1rem;
  margin-top: 0.5rem;
  font-size: 0.9375rem;
  color: #111827;
  line-height: 1.6;
  border: 1px solid
    ${({ $error }) => ($error ? "var(--lego-red-color, #e11d48)" : "#d1d5db")};
  border-radius: var(--border-radius-md);
  background-color: white;
  transition: var(--transition-base);
  resize: vertical;

  &::placeholder {
    color: #9ca3af;
  }

  &:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);
    outline: none;
  }

  &:disabled {
    background-color: #f3f4f6;
    color: #9ca3af;
    cursor: not-allowed;
  }
`;

export const FieldLabel = styled.label`
  font-weight: 600;
  font-size: 0.875rem;
  color: #374151;
  display: block;
  margin-bottom: 0.25rem;
`;

interface InputValidationFeedbackProps {
  error?: string;
}

export const InputValidationFeedback: React.FC<
  InputValidationFeedbackProps
> = ({ error }) => (error ? <ValidationError>{error}</ValidationError> : null);

const ValidationError = styled.div`
  color: var(--lego-red-color);
  font-weight: 500;
  font-size: 0.9rem;
`;
