import React, { ReactNode } from "react";
import styled from "styled-components";

const ReadmeLogo = () => <Readme>readme</Readme>;
const ReadmeLogoBody = () => <ReadmeBody>readme</ReadmeBody>;

const readmeIfy = (text: string, isBodyText = false) =>
  text && (
    <span>
      {text
        .split(/readme/)
        .reduce(
          (prev: ReactNode[], current, i) =>
            i
              ? prev.concat(
                  isBodyText ? (
                    <ReadmeLogoBody key={current} />
                  ) : (
                    <ReadmeLogo key={current} />
                  ),
                  current
                )
              : [current],
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

const ReadmeBody = Readme.withComponent("span");
