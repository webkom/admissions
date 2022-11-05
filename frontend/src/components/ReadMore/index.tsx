import React, { useEffect, useState } from "react";

import Wrapper from "./Wrapper";
import EllipsisWrapper from "./EllipsisWrapper";
import Ellipsis from "./Ellipsis";
import EllipsisToggle from "./EllipsisToggle";

interface ReadMoreProps {
  text: string;
  more?: string;
  less?: string;
  truncateLength?: number;
}

const ReadMore: React.FC<ReadMoreProps> = ({
  text,
  more = "Vis mer",
  less = "Vis mindre",
  truncateLength = 400,
}) => {
  const [textAsJsx, setTextAsJsx] = useState<React.ReactNode>(null);
  const [truncated, setTruncated] = useState<React.ReactNode>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setTextAsJsx(textToJsx(text));
    if (text.length < truncateLength) return;
    setTruncated(textToJsx(text.slice(0, truncateLength)));
  }, [text]);

  const textToJsx = (text: string) =>
    text.split("\n").map((line, i, arr) => {
      return (
        <span key={i}>
          {line}
          {i !== arr.length - 1 && <br />}
        </span>
      );
    });

  return (
    <Wrapper>
      {!truncated ? (
        textAsJsx
      ) : (
        <>
          {expanded ? textAsJsx : truncated}
          <EllipsisWrapper>
            {!expanded && <Ellipsis>...</Ellipsis>}
            <EllipsisToggle
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setExpanded(!expanded);
              }}
            >
              {expanded ? less : more}
            </EllipsisToggle>
          </EllipsisWrapper>
        </>
      )}
    </Wrapper>
  );
};

export default ReadMore;
