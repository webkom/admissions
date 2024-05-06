import React from "react";
import styled from "styled-components";
import loadingBall from "assets/loading.svg";

const LoadingBall = () => (
  <LoadingBallContainer>
    <img src={loadingBall} alt="Loading..." />
  </LoadingBallContainer>
);

interface LoadingBallContainerProps {
  width?: string | number;
  textAlign?: string;
}

const LoadingBallContainer = styled.div<LoadingBallContainerProps>`
  width: ${(props) => props.width || "100%"};
  text-align: ${(props) => props.textAlign || "center"};
`;

export default LoadingBall;
