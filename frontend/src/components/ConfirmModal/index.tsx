import React, { JSXElementConstructor, useState } from "react";
import {
  Overlay,
  ConfirmBox,
  Title,
  Message,
  ButtonGroup,
  ActionButton,
  TriggerText,
} from "./styles";

interface SubComponentProps {
  onClick: () => void;
}

interface ConfirmModalProps {
  onConfirm: () => void;
  title: string;
  message: string;
  Component?: JSXElementConstructor<SubComponentProps>;
  cancelText?: string;
  confirmText?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  onConfirm,
  title,
  message,
  Component,
  cancelText = "Avbryt",
  confirmText = "Ja",
}) => {
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
            {cancelText}
          </ActionButton>
          <ActionButton onClick={confirmAction}>{confirmText}</ActionButton>
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
