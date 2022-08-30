import React from "react";
import styled from "styled-components";
import loadingBall from "assets/loading.svg";

const LoadingBall = () => (
  <LoadingBallContainer>
    <img src={loadingBall} alt="Loading..." />
  </LoadingBallContainer>
);

const LoadingBallContainer = styled.div.attrs((props) => ({
  width: props.width || "100%",
  textAlign: props.textAlign || "center",
}))`
  width: ${(props) => props.width};
  text-align: ${(props) => props.textAlign};
`;

export default LoadingBall;
