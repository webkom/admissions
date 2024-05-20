import "~/@webkom/lego-bricks/dist/style.css";
import styled from "styled-components";

export const Overlay = styled.div`
  min-width: 100%;
  min-height: 100%;
  background: rgba(0, 0, 0, 0.8);
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
`;

export const ConfirmBox = styled.div`
  position: fixed;
  max-width: 420px;
  height: 200px;
  top: 100px;
  left: 0;
  right: 0;
  margin: 0 auto;
  background: #fff;
  border-radius: 5px;
  padding: 40px;
`;

export const Title = styled.h2`
  margin: 0;
  color: var(--lego-font-color);
`;

export const Message = styled.div`
  color: var(--lego-font-color);
`;

export const ActionButtonsWrapper = styled.div`
  display: flex;
  flex-direction: row;
  width: 100%;
  justify-content: space-between;
  margin-top: 20px;
  padding: 0;
`;
