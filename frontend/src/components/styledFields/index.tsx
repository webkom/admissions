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
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-ui);
  color: var(--color-text-primary);
  border: 1px solid
    ${(props) =>
      props.error ? "var(--lego-red-color)" : "var(--color-border-muted)"};
  border-radius: var(--border-radius-md);
  background-color: var(--color-surface-base);
  transition: var(--transition-base);

  &::placeholder {
    color: var(--color-text-subtle);
  }

  &:focus {
    border-color: var(--color-blue-6);
    box-shadow: 0 0 0 4px
      color-mix(in srgb, var(--color-blue-6) 10%, transparent);
    outline: none;
  }

  &:disabled {
    background-color: var(--color-surface-disabled);
    color: var(--color-text-disabled);
    cursor: not-allowed;
  }
`;

export const StyledTextAreaField = styled(Textarea)<StyledFieldProps>`
  display: block;
  width: 100%;
  min-height: 10rem;
  padding: var(--spacing-md);
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-ui);
  color: var(--color-text-primary);
  line-height: 1.6;
  border: 1px solid
    ${({ $error }) =>
      $error ? "var(--lego-red-color)" : "var(--color-border-muted)"};
  border-radius: var(--border-radius-md);
  background-color: var(--color-surface-base);
  transition: var(--transition-base);
  resize: vertical;

  &::placeholder {
    color: var(--color-text-subtle);
  }

  &:focus {
    border-color: var(--color-blue-6);
    box-shadow: 0 0 0 4px
      color-mix(in srgb, var(--color-blue-6) 10%, transparent);
    outline: none;
  }

  &:disabled {
    background-color: var(--color-surface-disabled);
    color: var(--color-text-disabled);
    cursor: not-allowed;
  }
`;

export const FieldLabel = styled.label`
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
  display: block;
  margin-bottom: var(--spacing-xs);
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
  font-size: var(--font-size-ui);
`;
