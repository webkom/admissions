import React, { useEffect } from "react";
import type { FieldProps } from "formik";
import styled from "styled-components";

import { FieldLabel, StyledTextAreaField } from "src/components/styledFields";
import { savePriorityTextDraft } from "src/utils/draftHelper";
import useDebouncedState from "src/utils/useDebouncedState";

const PriorityTextField: React.FC<FieldProps<string>> = ({ field, form }) => {
  const debouncedValue = useDebouncedState(field.value);

  useEffect(() => {
    savePriorityTextDraft(debouncedValue);
  }, [debouncedValue]);

  return (
    <Wrapper>
      <LabelRow>
        <FieldLabel htmlFor={field.name}>
          Prioriteringer og andre kommentarer
        </FieldLabel>
        <Optional>(valgfritt)</Optional>
      </LabelRow>
      <StyledTextAreaField
        {...field}
        id={field.name}
        onBlur={form.handleBlur}
        placeholder="For eksempel: 1. Webkom, 2. Koskom"
        minRows={4}
      />
    </Wrapper>
  );
};

export default PriorityTextField;

const Wrapper = styled.div`
  width: 100%;
`;

const LabelRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
`;

const Optional = styled.span`
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
`;
