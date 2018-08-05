import React from "react";
import Textarea from "react-textarea-autosize";

import { Card, CardParagraph, CardTitle } from "src/components/Card";

import Wrapper from "./Wrapper";
import "./style.css";

const PriorityTextField = ({
  field: { name, onChange, value },
  form: { handleBlur }
}) => {
  return (
    <Wrapper>
      <Card className="input" margin="0.5rem 1rem">
        <CardTitle margin="0.5rem" fontSize="0.8em">
          Her kan du rangere komiteer etter ønske, og komme med andre
          kommentarer.
        </CardTitle>
        <Textarea
          className="textarea"
          type="textarea"
          name={name}
          id={name}
          onChange={onChange}
          onBlur={handleBlur}
          placeholder="Skriv dine kommentarer her..."
          value={value}
          rows="10"
        />
      </Card>
    </Wrapper>
  );
};

export default PriorityTextField;
