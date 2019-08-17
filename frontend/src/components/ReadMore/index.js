import React, { Component } from "react";
import PropTypes from "prop-types";
import Truncate from "react-truncate";

import Wrapper from "./Wrapper";
import EllipsisWrapper from "./EllipsisWrapper";
import Ellipsis from "./Ellipsis";
import EllipsisToggle from "./EllipsisToggle";

class ReadMore extends Component {
  constructor(...args) {
    super(...args);

    this.state = {
      expanded: false,
      truncated: false
    };

    this.handleTruncate = this.handleTruncate.bind(this);
    this.toggleLines = this.toggleLines.bind(this);
  }

  handleTruncate(truncated) {
    if (this.state.truncated !== truncated) {
      this.setState({
        truncated
      });
    }
  }

  toggleLines(event) {
    event.preventDefault();

    this.setState({
      expanded: !this.state.expanded
    });
  }

  render() {
    const { children, more, less, lines } = this.props;

    const { expanded, truncated } = this.state;

    return (
      <Wrapper>
        <div>
          <Truncate
            lines={!expanded && lines}
            ellipsis={
              <EllipsisWrapper>
                {" "}
                <Ellipsis>...</Ellipsis>
                <EllipsisToggle href="#" onClick={this.toggleLines}>
                  {more}
                </EllipsisToggle>
              </EllipsisWrapper>
            }
            onTruncate={this.handleTruncate}
          >
            {children}
          </Truncate>
          {!truncated && expanded && (
            <EllipsisWrapper>
              <EllipsisToggle href="#" onClick={this.toggleLines}>
                {less}
              </EllipsisToggle>
            </EllipsisWrapper>
          )}
        </div>
      </Wrapper>
    );
  }
}

ReadMore.defaultProps = {
  lines: 3,
  more: "Utvid",
  less: "Vis mindre"
};

ReadMore.propTypes = {
  children: PropTypes.node.isRequired,
  text: PropTypes.node,
  lines: PropTypes.number
};

export default ReadMore;
