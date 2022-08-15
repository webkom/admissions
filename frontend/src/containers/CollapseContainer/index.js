import React, { useState } from "react";
import Collapse from "react-collapse";

import Icon from "src/components/Icon";

import Header from "./Header";
import DropDownIcon from "./DropDownIcon";
import CollapseButton from "./CollapseButton";
import Wrapper from "./Wrapper";
import HeaderWrapper from "./HeaderWrapper";

const CollapseContainer = ({ header, content }) => {
  const [isOpened, setIsOpened] = useState(false);

  const toggleView = () => {
    setIsOpened(!isOpened);
  };

  return (
    <Wrapper>
      <CollapseButton key="btn" onClick={() => toggleView()}>
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
};

export default CollapseContainer;
