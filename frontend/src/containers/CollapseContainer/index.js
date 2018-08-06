import React from "react";
import ReactDOM from "react-dom";
import { presets } from "react-motion";
import Collapse from "react-collapse";

import Header from "./Header";
import CollapseButton from "./CollapseButton";
import Wrapper from "./Wrapper";
import HeaderWrapper from "./HeaderWrapper";

class CollapseContainer extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = { isOpened: false };
  }

  toggleView = () => {
    this.setState(prevState => ({
      isOpened: !prevState.isOpened
    }));
  };

  render() {
    const { isOpened } = this.state;
    const { header, content } = this.props;

    return (
      <Wrapper>
        <CollapseButton key="btn" onClick={() => this.toggleView()}>
          <HeaderWrapper>
            <Header transform="uppercase">{header}</Header>
          </HeaderWrapper>
        </CollapseButton>
        <Collapse key="container" isOpened={isOpened}>
          {content}
        </Collapse>
      </Wrapper>
    );
  }
}

export default CollapseContainer;
