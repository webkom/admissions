import React from "react";

import { Wrapper, Name, Dash } from "./styles";

const UserInfo = ({ name }) => {
  return (
    <Wrapper>
      <span>Logget inn som </span> <Name>{name} </Name> <Dash> - </Dash>
      <a href="/logout/">Logg ut </a>
    </Wrapper>
  );
};

export default UserInfo;
