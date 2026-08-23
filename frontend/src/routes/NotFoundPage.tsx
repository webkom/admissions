import React from "react";
import AbakusLogo from "src/components/AbakusLogo";
import styled from "styled-components";

const NotFoundPage = () => {
  return (
    <DIV>
      <div>
        <AbakusLogo />
        <H1>404 – siden finnes ikke</H1>
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
  min-height: var(--viewport-min-height);
`;

export default NotFoundPage;
