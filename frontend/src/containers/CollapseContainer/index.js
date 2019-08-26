import React from "react";
import Collapse from "react-collapse";

import Icon from "src/components/Icon";

import Header from "./Header";
import DropDownIcon from "./DropDownIcon";
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
            <HeaderWrapper>
              <Header transform="uppercase">{header}</Header>
            </HeaderWrapper>
            <DropDownIcon>
              <Icon
                name={isOpened ? "arrow-dropup" : "arrow-dropdown"}
                iconPrefix="ios"
                size="1.5rem"
              />
            </DropDownIcon>
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
