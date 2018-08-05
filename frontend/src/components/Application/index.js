import React, { Component } from "react";

import Wrapper from "./Wrapper";

const Application = ({ committee, text }) => (
  <Wrapper>
    <span>{committee}</span>
    <p>{text}</p>
  </Wrapper>
);

export default Application;
