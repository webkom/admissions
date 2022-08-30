import React from "react";

import { Card, CardParagraph, CardTitle } from "src/components/Card";

const PriorityTextField = ({ text }) => {
  return (
    <Card margin="1.5rem 0rem">
      <CardTitle margin="0.5rem" fontSize="0.8em">
        Prioriteringer og andre kommentarer
      </CardTitle>
      <CardParagraph margin="0.5rem" fontSize="0.9em">
        {text}
      </CardParagraph>
    </Card>
  );
};

export default PriorityTextField;
