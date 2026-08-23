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
  max-width: var(--form-control-width);
  padding: var(--control-padding-block) var(--spacing-md);
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-ui);
  color: var(--color-text-primary);
  border: var(--border-width-default) solid
    ${(props) =>
      props.error ? "var(--lego-red-color)" : "var(--color-border-muted)"};
  border-radius: var(--border-radius-md);
  background-color: var(--color-surface-base);
  transition: var(--transition-base);

  &::placeholder {
    color: var(--color-text-subtle);
  }

  &:focus {
    border-color: var(--color-brand);
    box-shadow: 0 0 0 var(--focus-ring-width) var(--color-brand-ring);
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
  min-height: var(--group-editor-min-height);
  padding: var(--spacing-md);
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-ui);
  color: var(--color-text-primary);
  line-height: var(--line-height-copy);
  border: var(--border-width-default) solid
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
    border-color: var(--color-brand);
    box-shadow: 0 0 0 var(--focus-ring-width) var(--color-brand-ring);
    outline: none;
  }

  &:disabled {
    background-color: var(--color-surface-disabled);
    color: var(--color-text-disabled);
    cursor: not-allowed;
  }
`;

export const FieldLabel = styled.label`
  font-weight: var(--font-weight-semibold);
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
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-ui);
`;
