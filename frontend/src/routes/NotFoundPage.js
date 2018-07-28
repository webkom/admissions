import React from "react";
import AbakusLogo from "src/components/AbakusLogo";
import styled from "styled-components";

const NotFoundPage = () => {
  return (
    <DIV>
      <div>
        <AbakusLogo size="6em" />
        <H1>404 This Page Does Not Exist</H1>
      </div>
    </DIV>
  );
};

const H1 = styled.h1`
  text-align: center;
  margin: auto;
`;

const DIV = styled.div`
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100vh;
`;

export default NotFoundPage;
