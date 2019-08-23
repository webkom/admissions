import React from "react";
import styled from "styled-components";

const ReadmeLogo = () => <Readme>readme</Readme>;

const readmeIfy = text =>
  text && (
    <span>
      {text
        .split(/readme/)
        .reduce(
          (prev, current, i) =>
            i ? prev.concat(<ReadmeLogo key={current} />, current) : [current],
          []
        )}
    </span>
  );

export default readmeIfy;

/** Styles **/

const Readme = styled.div`
  font-family: "OCR A Extended", var(--font-family);
  font-weight: 400;
  text-transform: lowercase;
`;
