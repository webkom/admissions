import React, { useState } from "react";
import {
  Overlay,
  ConfirmBox,
  Title,
  Message,
  ButtonGroup,
  ActionButton,
  TriggerText,
} from "./styles";

const ConfirmModal = ({ onConfirm, title, message, Component }) => {
  const [isOpen, setIsOpen] = useState(false);

  const hideModal = () => {
    setIsOpen(false);
  };

  const showModal = () => {
    setIsOpen(true);
  };

  const confirmAction = () => {
    onConfirm();
    hideModal();
  };

  return isOpen ? (
    <Overlay>
      <ConfirmBox>
        <Title>{title}</Title>
        <Message>{message}</Message>
        <ButtonGroup>
          <ActionButton
            background="gray"
            border="1px solid darkgray"
            onClick={hideModal}
          >
            Cancel
          </ActionButton>
          <ActionButton onClick={confirmAction}>Ja</ActionButton>
        </ButtonGroup>
      </ConfirmBox>
    </Overlay>
  ) : Component ? (
    <Component onClick={showModal} />
  ) : (
    <TriggerText onClick={showModal}>{title}</TriggerText>
  );
};

export default ConfirmModal;
