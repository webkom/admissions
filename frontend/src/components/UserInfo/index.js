import React from "react";

import Wrapper from "./Wrapper";
import Name from "./Name";

const UserInfo = ({ name }) => {
  return (
    <Wrapper>
      <span>Logged in as </span> <Name>{name}</Name>
    </Wrapper>
  );
};

export default UserInfo;
