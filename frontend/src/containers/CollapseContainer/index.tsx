import React, { useState } from "react";

import Icon from "src/components/Icon";

import Header from "./Header";
import DropDownIcon from "./DropDownIcon";
import CollapseButton from "./CollapseButton";
import Wrapper from "./Wrapper";
import HeaderWrapper from "./HeaderWrapper";

interface CollapseContainerProps {
  header: React.ReactNode;
  content: React.ReactNode;
}

const CollapseContainer: React.FC<CollapseContainerProps> = ({
  header,
  content,
}) => {
  const [isOpened, setIsOpened] = useState(false);

  const toggleView = () => {
    setIsOpened(!isOpened);
  };

  return (
    <Wrapper>
      <CollapseButton key="btn" onClick={() => toggleView()}>
        <HeaderWrapper>
          <HeaderWrapper>
            <Header textTransform="uppercase">{header}</Header>
          </HeaderWrapper>
          <DropDownIcon>
            <Icon
              name={isOpened ? "arrow-dropup" : "arrow-dropdown"}
              prefix="ios"
              size="1.5rem"
            />
          </DropDownIcon>
        </HeaderWrapper>
      </CollapseButton>
      {isOpened && content}
    </Wrapper>
  );
};

export default CollapseContainer;
