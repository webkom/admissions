import React, { useState } from "react";
import PropTypes from "prop-types";
import Truncate from "react-truncate";

import Wrapper from "./Wrapper";
import EllipsisWrapper from "./EllipsisWrapper";
import Ellipsis from "./Ellipsis";
import EllipsisToggle from "./EllipsisToggle";

const ReadMore = ({ children, more, less, lines }) => {
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const handleTruncate = (_truncated) => {
    if (truncated !== _truncated) {
      setTruncated(_truncated);
    }
  };

  const toggleLines = (event) => {
    event.preventDefault();

    setExpanded(!expanded);
  };

  return (
    <Wrapper>
      <div>
        <Truncate
          lines={!expanded && lines}
          ellipsis={
            <EllipsisWrapper>
              {" "}
              <Ellipsis>...</Ellipsis>
              <EllipsisToggle href="#" onClick={toggleLines}>
                {more}
              </EllipsisToggle>
            </EllipsisWrapper>
          }
          onTruncate={handleTruncate}
        >
          {children}
        </Truncate>
        {!truncated && expanded && (
          <EllipsisWrapper>
            <EllipsisToggle href="#" onClick={toggleLines}>
              {less}
            </EllipsisToggle>
          </EllipsisWrapper>
        )}
      </div>
    </Wrapper>
  );
};

ReadMore.defaultProps = {
  lines: 3,
  more: "Utvid",
  less: "Vis mindre",
};

ReadMore.propTypes = {
  children: PropTypes.node.isRequired,
  text: PropTypes.node,
  lines: PropTypes.number,
};

export default ReadMore;
